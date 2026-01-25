import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../guards/auth.js";
import { z } from "zod";

const contratBody = z.object({
  chantierId: z.string().uuid(),
  sousTraitantId: z.string().uuid(),
  montantHT: z.number(),
  dateDebut: z.string().datetime().or(z.string()),
  dateFin: z.string().datetime().or(z.string()).optional(),
  objet: z.string().optional()
});

export async function contratsRoutes(app: FastifyInstance) {
  // GET /contrats - Liste des contrats ST
  app.get("/contrats", { preHandler: [requireAuth] }, async (req) => {
    const user = (req as any).user;
    const items = await prisma.contratST.findMany({
      where: { 
        chantier: { entrepriseId: user.entrepriseId }
      },
      include: {
        chantier: { select: { id: true, nom: true } },
        sousTraitant: { select: { id: true, nom: true, metier: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return { items };
  });

  // GET /contrats/:id
  app.get("/contrats/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const item = await prisma.contratST.findFirst({
      where: { 
        id, 
        chantier: { entrepriseId: user.entrepriseId }
      },
      include: {
        chantier: true,
        sousTraitant: true
      }
    });
    if (!item) return reply.status(404).send({ error: "Not found" });
    return { item };
  });

  // POST /contrats
  app.post("/contrats", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const parsed = contratBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    // Vérifier que le chantier appartient à l'entreprise
    const chantier = await prisma.chantier.findFirst({
      where: { id: parsed.data.chantierId, entrepriseId: user.entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

    const item = await prisma.contratST.create({
      data: {
        chantierId: parsed.data.chantierId,
        sousTraitantId: parsed.data.sousTraitantId,
        montantHT: parsed.data.montantHT,
        dateDebut: new Date(parsed.data.dateDebut),
        dateFin: parsed.data.dateFin ? new Date(parsed.data.dateFin) : null,
        objet: parsed.data.objet
      }
    });
    return { item };
  });

  // PATCH /contrats/:id
  app.patch("/contrats/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const parsed = contratBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const existing = await prisma.contratST.findFirst({ 
      where: { id, chantier: { entrepriseId: user.entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const updateData: any = { ...parsed.data };
    if (parsed.data.dateDebut) updateData.dateDebut = new Date(parsed.data.dateDebut);
    if (parsed.data.dateFin) updateData.dateFin = new Date(parsed.data.dateFin);

    const item = await prisma.contratST.update({
      where: { id },
      data: updateData
    });
    return { item };
  });

  // DELETE /contrats/:id
  app.delete("/contrats/:id", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    
    const existing = await prisma.contratST.findFirst({ 
      where: { id, chantier: { entrepriseId: user.entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    await prisma.contratST.delete({ where: { id } });
    return { deleted: true };
  });
}
