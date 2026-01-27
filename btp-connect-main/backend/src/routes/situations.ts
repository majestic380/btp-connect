import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../guards/auth.js";
import { z } from "zod";
import { StatutSituation } from "@prisma/client";

const situationBody = z.object({
  marcheId: z.string().uuid(),
  numero: z.number(),
  mois: z.string(),
  dateDebut: z.string(),
  dateFin: z.string(),
  montantTravaux: z.number(),
  montantCumule: z.number(),
  retenueGarantie: z.number(),
  acomptePrecedent: z.number(),
  penalites: z.number().optional(),
  montantNetHT: z.number(),
  tauxTVA: z.number().optional(),
  montantTTC: z.number(),
  statut: z.nativeEnum(StatutSituation).optional()
});

export async function situationsRoutes(app: FastifyInstance) {
  // GET /situations - Liste des situations
  app.get("/situations", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as any).user;
    const { marcheId } = req.query as { marcheId?: string };
    
    // Filtrer par entreprise via le marche -> chantier -> entreprise
    const where: any = { 
      marche: { 
        chantier: { entrepriseId: user.entrepriseId }
      }
    };
    if (marcheId) where.marcheId = marcheId;
    
    const items = await prisma.situation.findMany({
      where,
      include: {
        marche: { 
          select: { 
            id: true, 
            reference: true,
            chantier: { select: { id: true, nom: true } }
          } 
        }
      },
      orderBy: [{ marcheId: "asc" }, { numero: "desc" }]
    });
    return { items };
  });

  // GET /situations/:id
  app.get("/situations/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const item = await prisma.situation.findFirst({
      where: { 
        id, 
        marche: { chantier: { entrepriseId: user.entrepriseId } }
      },
      include: {
        marche: { 
          include: { 
            chantier: true 
          } 
        },
        lignes: true,
        validations: true
      }
    });
    if (!item) return reply.status(404).send({ error: "Not found" });
    return { item };
  });

  // POST /situations
  app.post("/situations", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const parsed = situationBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    // Vérifier que le marché appartient à l'entreprise
    const marche = await prisma.marche.findFirst({
      where: { id: parsed.data.marcheId, chantier: { entrepriseId: user.entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché not found" });

    const item = await prisma.situation.create({
      data: {
        marcheId: parsed.data.marcheId,
        numero: parsed.data.numero,
        mois: new Date(parsed.data.mois),
        dateDebut: new Date(parsed.data.dateDebut),
        dateFin: new Date(parsed.data.dateFin),
        montantTravaux: parsed.data.montantTravaux,
        montantCumule: parsed.data.montantCumule,
        retenueGarantie: parsed.data.retenueGarantie,
        acomptePrecedent: parsed.data.acomptePrecedent,
        penalites: parsed.data.penalites || 0,
        montantNetHT: parsed.data.montantNetHT,
        tauxTVA: parsed.data.tauxTVA || 20,
        montantTTC: parsed.data.montantTTC,
        statut: parsed.data.statut || StatutSituation.BROUILLON
      }
    });
    return { item };
  });

  // PATCH /situations/:id
  app.patch("/situations/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const parsed = situationBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const existing = await prisma.situation.findFirst({ 
      where: { id, marche: { chantier: { entrepriseId: user.entrepriseId } } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const data: any = { ...parsed.data };
    if (data.mois) data.mois = new Date(data.mois);
    if (data.dateDebut) data.dateDebut = new Date(data.dateDebut);
    if (data.dateFin) data.dateFin = new Date(data.dateFin);

    const item = await prisma.situation.update({
      where: { id },
      data
    });
    return { item };
  });

  // DELETE /situations/:id
  app.delete("/situations/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    
    const existing = await prisma.situation.findFirst({ 
      where: { id, marche: { chantier: { entrepriseId: user.entrepriseId } } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    await prisma.situation.delete({ where: { id } });
    return { deleted: true };
  });

  // POST /situations/:id/valider - Soumettre une situation pour validation
  app.post("/situations/:id/valider", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };

    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId: user.entrepriseId } } }
    });
    if (!situation) return reply.status(404).send({ error: "Not found" });

    if (situation.statut !== StatutSituation.BROUILLON) {
      return reply.status(400).send({ error: "Situation déjà soumise" });
    }

    const updated = await prisma.situation.update({
      where: { id },
      data: { statut: StatutSituation.SOUMISE }
    });
    return { item: updated };
  });
}
