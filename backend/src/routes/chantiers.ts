import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";

const createSchema = z.object({
  nom: z.string().min(2),
  client: z.string().optional(),
  adresse: z.string().optional(),
  montant: z.number().optional(),
  statut: z.enum(["en_cours", "termine", "suspendu"]).optional()
});

export async function chantiersRoutes(app: FastifyInstance) {
  app.get("/chantiers", { preHandler: [app.authenticate] }, async (req) => {
    const entrepriseId = req.user.entrepriseId;
    const items = await prisma.chantier.findMany({
      where: { entrepriseId },
      orderBy: { updatedAt: "desc" }
    });
    return { items };
  });

  app.post("/chantiers", { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const entrepriseId = req.user.entrepriseId;
    const chantier = await prisma.chantier.create({ data: { entrepriseId, ...parsed.data } });
    return { item: chantier };
  });

  app.patch("/chantiers/:id", { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] }, async (req, reply) => {
    const id = (req.params as any).id as string;
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.chantier.findFirst({ where: { id, entrepriseId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const chantier = await prisma.chantier.update({ where: { id }, data: parsed.data });
    return { item: chantier };
  });
}
