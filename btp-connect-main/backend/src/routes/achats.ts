import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";
import { sendEmail } from "../services/email.js";

const daSchema = z.object({
  chantierId: z.string().uuid(),
  planningTaskId: z.string().uuid(),
  designation: z.string().min(1),
  quantite: z.number().positive(),
  unite: z.string().optional(),
  dateBesoin: z.string(),
  commentaire: z.string().optional()
});

const consultationSchema = z.object({
  demandeAchatId: z.string().uuid(),
  fournisseurs: z.array(
    z.object({
      fournisseurId: z.string().uuid(),
      email: z.string().email().optional()
    })
  ).min(1),
  message: z.string().optional(),
  piecesJointes: z.any().optional(),
  relanceAuto: z.object({ afterDays: z.number().int().positive().optional(), maxRelances: z.number().int().positive().optional() }).optional()
});

const offreSchema = z.object({
  consultationId: z.string().uuid(),
  fournisseurId: z.string().uuid(),
  prix: z.number().positive(),
  remisePct: z.number().min(0).max(100).optional(),
  delaiLivraisonJours: z.number().int().positive().optional(),
  conditions: z.any().optional(),
  commentaire: z.string().optional()
});

const commandeSchema = z.object({
  demandeAchatId: z.string().uuid(),
  fournisseurId: z.string().uuid(),
  offreId: z.string().uuid().optional(),
  montant: z.number().positive(),
  dateLivraisonConfirmee: z.string(),
  lieuLivraison: z.string().optional(),
  conditionsAppliquees: z.any().optional()
});

const livraisonSchema = z.object({
  commandeId: z.string().uuid(),
  dateLivraisonReelle: z.string(),
  statut: z.enum(["PARTIAL", "FULL"]),
  commentaire: z.string().optional(),
  preuves: z.any().optional()
});

export async function achatsRoutes(app: FastifyInstance) {
  // POST /achats/da
  app.post(
    "/achats/da",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = daSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const chantier = await prisma.chantier.findFirst({ where: { id: parsed.data.chantierId, entrepriseId }, select: { id: true } });
      if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

      const task = await prisma.planningTask.findFirst({ where: { id: parsed.data.planningTaskId, chantierId: parsed.data.chantierId }, select: { id: true } });
      if (!task) return reply.status(404).send({ error: "Planning task not found" });

      const dateBesoin = new Date(parsed.data.dateBesoin);
      if (Number.isNaN(dateBesoin.getTime())) return reply.status(400).send({ error: "Invalid dateBesoin" });

      const item = await prisma.demandeAchat.create({
        data: {
          chantierId: parsed.data.chantierId,
          planningTaskId: parsed.data.planningTaskId,
          designation: parsed.data.designation,
          quantite: parsed.data.quantite,
          unite: parsed.data.unite,
          dateBesoin,
          commentaire: parsed.data.commentaire,
          createdById: req.user.id
        }
      });
      return reply.status(201).send({ item });
    }
  );

  // GET /achats/da
  app.get("/achats/da", { preHandler: [app.authenticate] }, async (req) => {
    const q = req.query as any;
    const entrepriseId = req.user.entrepriseId;
    const where: any = {
      chantier: { entrepriseId },
      ...(q.chantierId ? { chantierId: q.chantierId } : {}),
      ...(q.statut ? { statut: q.statut } : {})
    };
    const items = await prisma.demandeAchat.findMany({ where, orderBy: { createdAt: "desc" } });
    return { items };
  });

  // POST /achats/consultations (crée + envoie emails)
  app.post(
    "/achats/consultations",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = consultationSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const da = await prisma.demandeAchat.findFirst({
        where: { id: parsed.data.demandeAchatId, chantier: { entrepriseId } },
        include: { chantier: true }
      });
      if (!da) return reply.status(404).send({ error: "DemandeAchat not found" });

      // Crée la consultation (si existe déjà, erreur)
      const consultation = await prisma.achatConsultation.create({
        data: {
          demandeAchatId: da.id,
          message: parsed.data.message,
          piecesJointes: parsed.data.piecesJointes ?? undefined,
          relanceAfterDays: parsed.data.relanceAuto?.afterDays,
          relanceMax: parsed.data.relanceAuto?.maxRelances,
          statut: "SENT" as any
        }
      });

      // Crée les lignes fournisseurs + envoi emails
      const results: any[] = [];
      for (const f of parsed.data.fournisseurs) {
        const supplier = await prisma.sousTraitant.findFirst({ where: { id: f.fournisseurId, entrepriseId }, select: { id: true, email: true, nom: true } });
        if (!supplier) {
          results.push({ fournisseurId: f.fournisseurId, success: false, error: "Fournisseur introuvable" });
          continue;
        }

        const emailTo = f.email || supplier.email;
        const row = await prisma.achatConsultationFournisseur.create({
          data: {
            consultationId: consultation.id,
            fournisseurId: supplier.id,
            email: emailTo
          }
        });

        if (!emailTo) {
          results.push({ fournisseurId: supplier.id, success: false, error: "Pas d'email" });
          continue;
        }

        try {
          const subject = `Consultation achat - ${da.designation} (${da.chantier.nom})`;
          const text =
            `Bonjour ${supplier.nom},\n\n` +
            `Merci de nous transmettre votre meilleure offre pour :\n` +
            `- ${da.designation}\n- Quantité : ${da.quantite}${da.unite ? " " + da.unite : ""}\n` +
            `- Besoin chantier : ${da.dateBesoin.toLocaleDateString("fr-FR")}\n\n` +
            `${parsed.data.message || ""}\n\n` +
            `Merci d'indiquer : prix, remise, délai de livraison, conditions.\n\nCordialement,\nBTP Connect`;

          const send = await sendEmail({ to: [emailTo], subject, text });
          await prisma.achatConsultationFournisseur.update({
            where: { id: row.id },
            data: { dateEnvoi: new Date() }
          });
          results.push({ fournisseurId: supplier.id, success: send.success, messageId: send.messageId });
        } catch (e) {
          results.push({ fournisseurId: supplier.id, success: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      await prisma.demandeAchat.update({ where: { id: da.id }, data: { statut: "SENT" as any } });

      return reply.status(201).send({ consultationId: consultation.id, results });
    }
  );

  // POST /achats/offres (enregistre une offre)
  app.post(
    "/achats/offres",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = offreSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const cf = await prisma.achatConsultationFournisseur.findFirst({
        where: { consultationId: parsed.data.consultationId, fournisseurId: parsed.data.fournisseurId, consultation: { demandeAchat: { chantier: { entrepriseId } } } },
        include: { consultation: { include: { demandeAchat: true } } }
      });
      if (!cf) return reply.status(404).send({ error: "Consultation fournisseur not found" });

      const item = await prisma.achatOffre.upsert({
        where: { consultationFournisseurId: cf.id },
        create: {
          consultationFournisseurId: cf.id,
          prix: parsed.data.prix,
          remisePct: parsed.data.remisePct,
          delaiLivraisonJours: parsed.data.delaiLivraisonJours,
          conditions: parsed.data.conditions ?? undefined,
          commentaire: parsed.data.commentaire
        },
        update: {
          prix: parsed.data.prix,
          remisePct: parsed.data.remisePct,
          delaiLivraisonJours: parsed.data.delaiLivraisonJours,
          conditions: parsed.data.conditions ?? undefined,
          commentaire: parsed.data.commentaire
        }
      });

      await prisma.achatConsultationFournisseur.update({ where: { id: cf.id }, data: { dateReponse: new Date() } });
      return reply.status(201).send({ item });
    }
  );

  // POST /achats/commandes
  app.post(
    "/achats/commandes",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = commandeSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const da = await prisma.demandeAchat.findFirst({ where: { id: parsed.data.demandeAchatId, chantier: { entrepriseId } } });
      if (!da) return reply.status(404).send({ error: "DemandeAchat not found" });

      const fournisseur = await prisma.sousTraitant.findFirst({ where: { id: parsed.data.fournisseurId, entrepriseId }, select: { id: true } });
      if (!fournisseur) return reply.status(404).send({ error: "Fournisseur not found" });

      const dateLiv = new Date(parsed.data.dateLivraisonConfirmee);
      if (Number.isNaN(dateLiv.getTime())) return reply.status(400).send({ error: "Invalid dateLivraisonConfirmee" });

      const item = await prisma.achatCommande.create({
        data: {
          demandeAchatId: da.id,
          fournisseurId: fournisseur.id,
          offreId: parsed.data.offreId,
          montant: parsed.data.montant,
          dateLivraisonConfirmee: dateLiv,
          lieuLivraison: parsed.data.lieuLivraison,
          conditionsAppliquees: parsed.data.conditionsAppliquees ?? undefined,
          statut: "CREATED" as any
        }
      });

      // Alerte retard matériel si livraison > besoin
      if (dateLiv.getTime() > da.dateBesoin.getTime()) {
        const retardJours = Math.ceil((dateLiv.getTime() - da.dateBesoin.getTime()) / (1000 * 60 * 60 * 24));
        await prisma.alerte.create({
          data: {
            chantierId: da.chantierId,
            type: "RETARD_MATERIEL",
            niveau: (retardJours >= 3 ? "CRITICAL" : "WARNING") as any,
            source: "ACHAT" as any,
            message: `Livraison confirmée après besoin chantier (+${retardJours}j)`,
            planningTaskId: da.planningTaskId
          }
        });
      }

      await prisma.demandeAchat.update({ where: { id: da.id }, data: { statut: "ORDERED" as any } });
      return reply.status(201).send({ item });
    }
  );

  // POST /achats/livraisons
  app.post(
    "/achats/livraisons",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = livraisonSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const commande = await prisma.achatCommande.findFirst({
        where: { id: parsed.data.commandeId, demandeAchat: { chantier: { entrepriseId } } },
        include: { demandeAchat: true }
      });
      if (!commande) return reply.status(404).send({ error: "Commande not found" });

      const date = new Date(parsed.data.dateLivraisonReelle);
      if (Number.isNaN(date.getTime())) return reply.status(400).send({ error: "Invalid dateLivraisonReelle" });

      const item = await prisma.achatLivraison.create({
        data: {
          commandeId: commande.id,
          dateLivraisonReelle: date,
          statut: parsed.data.statut as any,
          commentaire: parsed.data.commentaire,
          preuves: parsed.data.preuves ?? undefined
        }
      });

      return reply.status(201).send({ item });
    }
  );

  // GET /achats/retards
  app.get(
    "/achats/retards",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const q = req.query as any;
      if (!q.chantierId) return reply.status(400).send({ error: "chantierId required" });
      const entrepriseId = req.user.entrepriseId;
      const chantier = await prisma.chantier.findFirst({ where: { id: q.chantierId, entrepriseId }, select: { id: true } });
      if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

      const das = await prisma.demandeAchat.findMany({
        where: { chantierId: q.chantierId },
        include: { commandes: true }
      });

      const items = [] as any[];
      for (const da of das) {
        const cmd = da.commandes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        if (!cmd) continue;
        if (cmd.dateLivraisonConfirmee.getTime() > da.dateBesoin.getTime()) {
          const retardJours = Math.ceil((cmd.dateLivraisonConfirmee.getTime() - da.dateBesoin.getTime()) / (1000 * 60 * 60 * 24));
          items.push({
            demandeAchatId: da.id,
            planningTaskId: da.planningTaskId,
            dateBesoin: da.dateBesoin,
            dateLivraisonConfirmee: cmd.dateLivraisonConfirmee,
            retardJours,
            niveau: retardJours >= 3 ? "CRITICAL" : "WARNING"
          });
        }
      }
      return { items };
    }
  );
}
