// ============================================
// 🏗️ BTP CONNECT v9.2 - ROUTES EMAIL
// Routes API pour l'envoi d'emails
// ============================================

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../guards/auth.js";
import { requireRole } from "../guards/role.js";
import { z } from "zod";
import { sendEmail, testEmailConfig } from "../services/email.js";
import { prisma } from "../lib/prisma.js";

const emailSchema = z.object({
  to: z.string().email().or(z.array(z.string().email())),
  subject: z.string().min(1),
  body: z.string().min(1),
  html: z.boolean().optional()
});

const relanceSchema = z.object({
  consultationId: z.string().uuid(),
  entrepriseIds: z.array(z.string().uuid()),
  message: z.string().optional()
});

export async function emailRoutes(app: FastifyInstance) {
  // POST /email/send - Envoi générique d'email
  app.post("/email/send", { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    try {
      const result = await sendEmail({
        to: Array.isArray(parsed.data.to) ? parsed.data.to : [parsed.data.to],
        subject: parsed.data.subject,
        text: parsed.data.body,
        html: parsed.data.html ? parsed.data.body : undefined
      });

      return { success: result.success, messageId: result.messageId };
    } catch (error) {
      console.error('Erreur envoi email:', error);
      return reply.status(500).send({ 
        error: "Erreur envoi email",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // POST /email/relance - Envoyer des relances pour une consultation
  app.post("/email/relance", { 
    preHandler: [requireAuth, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const parsed = relanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    try {
      // Récupérer la consultation
      const consultation = await prisma.consultation.findUnique({
        where: { id: parsed.data.consultationId },
        include: {
          chantier: true,
          entreprisesConsultees: {
            where: { sousTraitantId: { in: parsed.data.entrepriseIds } },
            include: { sousTraitant: true }
          }
        }
      });

      if (!consultation) {
        return reply.status(404).send({ error: "Consultation non trouvée" });
      }

      const results = [];
      for (const ce of consultation.entreprisesConsultees) {
        if (!ce.sousTraitant.email) {
          results.push({ entrepriseId: ce.sousTraitantId, success: false, error: "Pas d'email" });
          continue;
        }

        try {
          const result = await sendEmail({
            to: ce.sousTraitant.email,
            subject: `Relance - Consultation ${consultation.reference}`,
            text: `Bonjour ${ce.sousTraitant.nom},\n\nNous vous rappelons que vous avez été consulté pour le marché "${consultation.objet}".\n\nDate limite de réponse : ${new Date(consultation.dateLimite).toLocaleDateString('fr-FR')}\n\n${parsed.data.message || ''}\n\nCordialement,\nBTP Connect`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2>Relance - Consultation ${consultation.reference}</h2>
                <p>Bonjour <strong>${ce.sousTraitant.nom}</strong>,</p>
                <p>Nous vous rappelons que vous avez été consulté pour le marché "<strong>${consultation.objet}</strong>".</p>
                <p><strong>Date limite de réponse :</strong> ${new Date(consultation.dateLimite).toLocaleDateString('fr-FR')}</p>
                ${parsed.data.message ? `<p>${parsed.data.message}</p>` : ''}
                <p>Cordialement,<br>BTP Connect</p>
              </div>
            `
          });

          // Mettre à jour le compteur de relances
          await prisma.consultationEntreprise.update({
            where: { id: ce.id },
            data: { 
              nbRelances: ce.nbRelances + 1,
              derniereRelance: new Date()
            }
          });

          results.push({ entrepriseId: ce.sousTraitantId, success: result.success, messageId: result.messageId });
        } catch (error) {
          results.push({ 
            entrepriseId: ce.sousTraitantId, 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return { 
        success: true, 
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        details: results
      };
    } catch (error) {
      console.error('Erreur envoi relances:', error);
      return reply.status(500).send({ 
        error: "Erreur envoi relances",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // POST /email/batch - Envoi en batch (max 50)
  app.post("/email/batch", { 
    preHandler: [requireAuth, requireRole(["ADMIN"])] 
  }, async (req, reply) => {
    const body = req.body as Array<{ to: string; subject: string; body: string }>;
    
    if (!Array.isArray(body) || body.length === 0) {
      return reply.status(400).send({ error: "Un tableau d'emails est requis" });
    }
    if (body.length > 50) {
      return reply.status(400).send({ error: "Maximum 50 emails par batch" });
    }

    const results = [];
    for (const email of body) {
      try {
        const result = await sendEmail({
          to: [email.to],
          subject: email.subject,
          text: email.body
        });
        results.push({ to: email.to, success: result.success, messageId: result.messageId });
      } catch (error) {
        results.push({ 
          to: email.to, 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { 
      success: true,
      total: body.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    };
  });

  // GET /email/test - Tester la configuration SMTP
  app.get("/email/test", { 
    preHandler: [requireAuth, requireRole(["ADMIN"])] 
  }, async (_req, reply) => {
    try {
      const result = await testEmailConfig();
      return { 
        success: result.success, 
        message: result.success ? "Configuration SMTP valide" : result.error,
        config: {
          host: process.env.SMTP_HOST || 'non configuré',
          port: process.env.SMTP_PORT || '587',
          user: process.env.SMTP_USER ? '***configuré***' : 'non configuré'
        }
      };
    } catch (error) {
      return reply.status(500).send({ 
        success: false,
        error: "Erreur test configuration",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
