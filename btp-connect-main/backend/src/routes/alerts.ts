import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";

const ackSchema = z.object({
  note: z.string().optional()
});

export async function alertsRoutes(app: FastifyInstance) {
  // GET /alerts
  app.get("/alerts", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = req.query as any;
    const entrepriseId = req.user.entrepriseId;

    const where: any = {
      chantier: { entrepriseId },
      ...(q.chantierId ? { chantierId: q.chantierId } : {}),
      ...(q.niveau ? { niveau: q.niveau } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.ack != null ? { ack: q.ack === "true" || q.ack === true } : {})
    };

    const items = await prisma.alerte.findMany({
      where,
      orderBy: [{ createdAt: "desc" }]
    });

    return { items };
  });

  // POST /alerts/:id/ack (EE/DIR)
  app.post(
    "/alerts/:id/ack",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "DIRECTION"]) ] },
    async (req, reply) => {
      const id = (req.params as any).id as string;
      const parsed = ackSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const existing = await prisma.alerte.findFirst({ where: { id, chantier: { entrepriseId } }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: "Not found" });

      const item = await prisma.alerte.update({
        where: { id },
        data: {
          ack: true,
          ackById: req.user.id,
          ackAt: new Date(),
          ackNote: parsed.data.note
        }
      });

      return { item };
    }
  );

  // GET /risks/score (MVP simple)
  app.get(
    "/risks/score",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "DIRECTION"]) ] },
    async (req, reply) => {
      const q = req.query as any;
      if (!q.chantierId) return reply.status(400).send({ error: "chantierId required" });

      const entrepriseId = req.user.entrepriseId;
      const chantier = await prisma.chantier.findFirst({ where: { id: q.chantierId, entrepriseId }, select: { id: true } });
      if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

      const total = await prisma.alerte.count({ where: { chantierId: q.chantierId } });
      const critical = await prisma.alerte.count({ where: { chantierId: q.chantierId, niveau: "CRITICAL" as any } });
      const warning = await prisma.alerte.count({ where: { chantierId: q.chantierId, niveau: "WARNING" as any } });
      const score = Math.max(0, Math.min(100, critical * 25 + warning * 10 + Math.min(30, total)));

      const niveau = score <= 30 ? "SAIN" : score <= 60 ? "SURVEILLANCE" : "CRITICAL";
      return {
        chantierId: q.chantierId,
        score,
        niveau,
        drivers: [
          { key: "critical_alerts", weight: critical * 25 },
          { key: "warning_alerts", weight: warning * 10 },
          { key: "volume_alerts", weight: Math.min(30, total) }
        ]
      };
    }
  );
}
