import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../guards/auth.js";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";

const factureBody = z.object({
  chantierId: z.string().uuid(),
  numero: z.string(),
  type: z.string(),
  stId: z.string().uuid().optional(),
  montantHT: z.number(),
  tva: z.number().optional(),
  dateFacture: z.string(),
  dateEcheance: z.string().optional(),
  statut: z.string().optional(),
  fichierUrl: z.string().optional()
});

export async function facturesRoutes(app: FastifyInstance) {
  // GET /factures - Liste des factures
  app.get("/factures", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as any).user;
    const { chantierId, statut, type } = req.query as { 
      chantierId?: string; 
      statut?: string;
      type?: string;
    };
    
    // Filtrer par entreprise via chantier
    const where: any = { 
      chantier: { entrepriseId: user.entrepriseId }
    };
    if (chantierId) where.chantierId = chantierId;
    if (statut) where.statut = statut;
    if (type) where.type = type;
    
    const items = await prisma.facture.findMany({
      where,
      include: {
        chantier: { select: { id: true, nom: true, client: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    // Calculer montantTTC pour chaque facture
    const itemsWithTTC = items.map(f => ({
      ...f,
      montantTTC: f.montantHT.mul(new Decimal(1).add(f.tva.div(100)))
    }));

    return { items: itemsWithTTC };
  });

  // GET /factures/:id
  app.get("/factures/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const item = await prisma.facture.findFirst({
      where: { 
        id, 
        chantier: { entrepriseId: user.entrepriseId }
      },
      include: {
        chantier: true
      }
    });
    if (!item) return reply.status(404).send({ error: "Not found" });
    
    // Ajouter montantTTC calculé
    const montantTTC = item.montantHT.mul(new Decimal(1).add(item.tva.div(100)));
    return { item: { ...item, montantTTC } };
  });

  // POST /factures
  app.post("/factures", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const parsed = factureBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    // Vérifier que le chantier appartient à l'entreprise
    const chantier = await prisma.chantier.findFirst({
      where: { id: parsed.data.chantierId, entrepriseId: user.entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

    const item = await prisma.facture.create({
      data: {
        chantierId: parsed.data.chantierId,
        numero: parsed.data.numero,
        type: parsed.data.type,
        stId: parsed.data.stId,
        montantHT: parsed.data.montantHT,
        tva: parsed.data.tva || 20,
        dateFacture: new Date(parsed.data.dateFacture),
        dateEcheance: parsed.data.dateEcheance ? new Date(parsed.data.dateEcheance) : null,
        statut: parsed.data.statut || 'en_attente',
        fichierUrl: parsed.data.fichierUrl
      }
    });
    return { item };
  });

  // PATCH /factures/:id
  app.patch("/factures/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const parsed = factureBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const existing = await prisma.facture.findFirst({ 
      where: { id, chantier: { entrepriseId: user.entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const data: any = { ...parsed.data };
    if (data.dateFacture) data.dateFacture = new Date(data.dateFacture);
    if (data.dateEcheance) data.dateEcheance = new Date(data.dateEcheance);

    const item = await prisma.facture.update({
      where: { id },
      data
    });
    return { item };
  });

  // DELETE /factures/:id
  app.delete("/factures/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    
    const existing = await prisma.facture.findFirst({ 
      where: { id, chantier: { entrepriseId: user.entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    await prisma.facture.delete({ where: { id } });
    return { deleted: true };
  });

  // GET /factures/stats - Statistiques de facturation
  app.get("/factures/stats", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as any).user;
    
    const factures = await prisma.facture.findMany({
      where: { chantier: { entrepriseId: user.entrepriseId } }
    });

    const montantTotalHT = factures.reduce(
      (sum, f) => sum.add(f.montantHT), 
      new Decimal(0)
    );

    const montantTotalTTC = factures.reduce(
      (sum, f) => sum.add(f.montantHT.mul(new Decimal(1).add(f.tva.div(100)))), 
      new Decimal(0)
    );

    const stats = {
      total: factures.length,
      montantTotalHT: montantTotalHT.toNumber(),
      montantTotalTTC: montantTotalTTC.toNumber(),
      parStatut: {
        en_attente: factures.filter(f => f.statut === 'en_attente').length,
        emise: factures.filter(f => f.statut === 'emise').length,
        payee: factures.filter(f => f.statut === 'payee').length,
        impayee: factures.filter(f => f.statut === 'impayee').length
      }
    };

    return { stats };
  });
}
