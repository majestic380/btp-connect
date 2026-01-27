import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";

const createSchema = z.object({
  nom: z.string().min(2),
  siret: z.string().min(9).max(14).optional(),
  metier: z.string().optional(),
  email: z.string().email().optional(),
  tel: z.string().optional(),
  ville: z.string().optional(),
  note: z.number().min(0).max(5).optional()
});

export async function stRoutes(app: FastifyInstance) {
  app.get("/st", { preHandler: [app.authenticate] }, async (req) => {
    const entrepriseId = req.user.entrepriseId;
    const items = await prisma.sousTraitant.findMany({
      where: { entrepriseId },
      orderBy: { updatedAt: "desc" }
    });
    return { items };
  });

  app.post("/st", { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const entrepriseId = req.user.entrepriseId;
    const st = await prisma.sousTraitant.create({ data: { entrepriseId, ...parsed.data } });
    return { item: st };
  });

  app.patch("/st/:id", { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] }, async (req, reply) => {
    const id = (req.params as any).id as string;
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.sousTraitant.findFirst({ where: { id, entrepriseId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const st = await prisma.sousTraitant.update({ where: { id }, data: parsed.data });
    return { item: st };
  });

  app.delete("/st/:id", { preHandler: [app.authenticate, requireRole(["ADMIN"])] }, async (req, reply) => {
    const id = (req.params as any).id as string;
    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.sousTraitant.findFirst({ where: { id, entrepriseId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    await prisma.sousTraitant.delete({ where: { id } });
    return { ok: true };
  });
}
