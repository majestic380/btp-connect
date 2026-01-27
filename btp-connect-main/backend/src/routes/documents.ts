import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../guards/auth.js";
import { z } from "zod";

const documentBody = z.object({
  sousTraitantId: z.string().uuid(),
  type: z.string(),
  nom: z.string(),
  fichierUrl: z.string().optional(),
  dateExpiration: z.string().optional(),
  statut: z.string().optional()
});

export async function documentsRoutes(app: FastifyInstance) {
  // GET /documents - Liste des documents ST
  app.get("/documents", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as any).user;
    const { sousTraitantId, type, statut } = req.query as { 
      sousTraitantId?: string;
      type?: string;
      statut?: string;
    };
    
    const where: any = { 
      sousTraitant: { entrepriseId: user.entrepriseId }
    };
    if (sousTraitantId) where.sousTraitantId = sousTraitantId;
    if (type) where.type = type;
    if (statut) where.statut = statut;
    
    const items = await prisma.documentST.findMany({
      where,
      include: {
        sousTraitant: { select: { id: true, nom: true, metier: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return { items };
  });

  // GET /documents/:id
  app.get("/documents/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const item = await prisma.documentST.findFirst({
      where: { 
        id, 
        sousTraitant: { entrepriseId: user.entrepriseId }
      },
      include: {
        sousTraitant: true
      }
    });
    if (!item) return reply.status(404).send({ error: "Not found" });
    return { item };
  });

  // POST /documents
  app.post("/documents", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const parsed = documentBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    // Vérifier que le sous-traitant appartient à l'entreprise
    const st = await prisma.sousTraitant.findFirst({
      where: { id: parsed.data.sousTraitantId, entrepriseId: user.entrepriseId }
    });
    if (!st) return reply.status(404).send({ error: "Sous-traitant not found" });

    // Vérifier la date d'expiration et définir le statut
    let statut = parsed.data.statut || 'valide';
    if (parsed.data.dateExpiration) {
      const expDate = new Date(parsed.data.dateExpiration);
      if (expDate < new Date()) {
        statut = 'expire';
      }
    }

    const item = await prisma.documentST.create({
      data: {
        sousTraitantId: parsed.data.sousTraitantId,
        type: parsed.data.type,
        nom: parsed.data.nom,
        fichierUrl: parsed.data.fichierUrl,
        statut,
        dateExpiration: parsed.data.dateExpiration ? new Date(parsed.data.dateExpiration) : null
      }
    });
    return { item };
  });

  // PATCH /documents/:id
  app.patch("/documents/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const parsed = documentBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const existing = await prisma.documentST.findFirst({ 
      where: { id, sousTraitant: { entrepriseId: user.entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const data: any = { ...parsed.data };
    if (data.dateExpiration) data.dateExpiration = new Date(data.dateExpiration);

    const item = await prisma.documentST.update({
      where: { id },
      data
    });
    return { item };
  });

  // DELETE /documents/:id
  app.delete("/documents/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    
    const existing = await prisma.documentST.findFirst({ 
      where: { id, sousTraitant: { entrepriseId: user.entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    await prisma.documentST.delete({ where: { id } });
    return { deleted: true };
  });

  // GET /documents/types - Liste des types de documents
  app.get("/documents/types", { preHandler: [requireAuth] }, async () => {
    const types = [
      { code: 'attestation_urssaf', label: 'Attestation URSSAF', obligatoire: true },
      { code: 'kbis', label: 'Extrait Kbis', obligatoire: true },
      { code: 'assurance_rc', label: 'Assurance RC Pro', obligatoire: true },
      { code: 'assurance_decennale', label: 'Assurance Décennale', obligatoire: true },
      { code: 'carte_pro', label: 'Carte Professionnelle BTP', obligatoire: false },
      { code: 'devis', label: 'Devis', obligatoire: false },
      { code: 'facture', label: 'Facture', obligatoire: false },
      { code: 'plan', label: 'Plan', obligatoire: false },
      { code: 'photo', label: 'Photo', obligatoire: false },
      { code: 'autre', label: 'Autre', obligatoire: false }
    ];
    return { types };
  });

  // GET /documents/expiring - Documents expirant bientôt
  app.get("/documents/expiring", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as any).user;
    const { days = 30 } = req.query as { days?: number };
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + Number(days));
    
    const items = await prisma.documentST.findMany({
      where: {
        sousTraitant: { entrepriseId: user.entrepriseId },
        dateExpiration: {
          lte: futureDate,
          gte: new Date()
        }
      },
      include: {
        sousTraitant: { select: { id: true, nom: true } }
      },
      orderBy: { dateExpiration: "asc" }
    });
    return { items };
  });
}
