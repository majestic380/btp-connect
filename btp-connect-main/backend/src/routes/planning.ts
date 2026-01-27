import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";

const initSchema = z.object({
  chantierId: z.string().uuid(),
  tasks: z.array(
    z.object({
      idExterne: z.string().optional(),
      sousTraitantId: z.string().uuid().optional(),
      nom: z.string().min(1),
      dateDebut: z.string(),
      dateFin: z.string(),
      critique: z.boolean().optional(),
      avancementPrevuCourbe: z.any().optional()
    })
  ).min(1)
});

export async function planningRoutes(app: FastifyInstance) {
  // GET /planning
  app.get("/planning", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = req.query as any;
    const entrepriseId = req.user.entrepriseId;
    if (!q.chantierId) return reply.status(400).send({ error: "chantierId required" });

    const chantier = await prisma.chantier.findFirst({ where: { id: q.chantierId, entrepriseId }, select: { id: true } });
    if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

    const items = await prisma.planningTask.findMany({ where: { chantierId: q.chantierId }, orderBy: { dateDebut: "asc" } });
    return { items };
  });

  // POST /planning/init (EE)
  app.post(
    "/planning/init",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = initSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const chantier = await prisma.chantier.findFirst({ where: { id: parsed.data.chantierId, entrepriseId }, select: { id: true } });
      if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

      const created = [] as any[];
      for (const t of parsed.data.tasks) {
        const d1 = new Date(t.dateDebut);
        const d2 = new Date(t.dateFin);
        if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
          return reply.status(400).send({ error: "Invalid date in tasks" });
        }
        created.push(
          await prisma.planningTask.create({
            data: {
              chantierId: parsed.data.chantierId,
              sousTraitantId: t.sousTraitantId,
              idExterne: t.idExterne,
              nom: t.nom,
              dateDebut: d1,
              dateFin: d2,
              critique: t.critique ?? false,
              avancementPrevuCourbe: t.avancementPrevuCourbe ?? undefined
            }
          })
        );
      }

      return reply.status(201).send({ items: created });
    }
  );

  // GET /planning/ecarts (MVP)
  app.get("/planning/ecarts", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = req.query as any;
    const entrepriseId = req.user.entrepriseId;
    if (!q.chantierId) return reply.status(400).send({ error: "chantierId required" });
    const date = q.date ? new Date(q.date) : new Date();
    if (Number.isNaN(date.getTime())) return reply.status(400).send({ error: "Invalid date" });

    const chantier = await prisma.chantier.findFirst({ where: { id: q.chantierId, entrepriseId }, select: { id: true } });
    if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

    const tasks = await prisma.planningTask.findMany({ where: { chantierId: q.chantierId } });
    const items = [] as any[];

    for (const task of tasks) {
      // Avancement réel = dernier journal VALIDATED sur la tâche
      const last = await prisma.journalEntry.findFirst({
        where: { planningTaskId: task.id, statut: "VALIDATED" as any },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }]
      });
      const reel = last?.avancement ?? 0;

      // Avancement prévu = si courbe fournie, prendre dernier pct <= date ; sinon ratio simple temps
      let prevu = 0;
      if (task.avancementPrevuCourbe && Array.isArray(task.avancementPrevuCourbe)) {
        const curve = task.avancementPrevuCourbe as any[];
        const eligible = curve
          .map((p) => ({ d: new Date(p.date), pct: Number(p.pct) }))
          .filter((p) => !Number.isNaN(p.d.getTime()) && p.d.getTime() <= date.getTime())
          .sort((a, b) => a.d.getTime() - b.d.getTime());
        prevu = eligible.length ? Math.max(0, Math.min(100, eligible[eligible.length - 1].pct)) : 0;
      } else {
        const total = task.dateFin.getTime() - task.dateDebut.getTime();
        const done = Math.max(0, Math.min(total, date.getTime() - task.dateDebut.getTime()));
        prevu = total > 0 ? Math.round((done / total) * 100) : 0;
      }

      const ecart = reel - prevu;
      let niveau = "INFO";
      if (ecart < -10) niveau = "CRITICAL";
      else if (ecart < -5) niveau = "WARNING";

      items.push({ taskId: task.id, avancementPrevu: prevu, avancementReelValide: reel, ecart, niveau, critique: task.critique });
    }

    return { chantierId: q.chantierId, date: date.toISOString(), items };
  });
}
