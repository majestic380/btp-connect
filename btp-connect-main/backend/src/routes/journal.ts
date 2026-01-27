import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";

const createJournalSchema = z.object({
  chantierId: z.string().uuid(),
  planningTaskId: z.string().uuid(),
  sousTraitantId: z.string().uuid().optional(),
  date: z.string().min(8), // ISO date
  avancement: z.number().min(0).max(100),
  commentaire: z.string().min(1),
  photos: z.any().optional(),
  aleas: z.any().optional()
});

const decisionSchema = z.object({
  decision: z.enum(["VALIDATE", "REFUSE"]),
  commentaireEE: z.string().optional()
});

export async function journalRoutes(app: FastifyInstance) {
  // GET /journal
  app.get("/journal", { preHandler: [app.authenticate] }, async (req) => {
    const q = req.query as any;
    const entrepriseId = req.user.entrepriseId;

    const where: any = {
      chantier: { entrepriseId },
      ...(q.chantierId ? { chantierId: q.chantierId } : {}),
      ...(q.planningTaskId ? { planningTaskId: q.planningTaskId } : {}),
      ...(q.sousTraitantId ? { sousTraitantId: q.sousTraitantId } : {}),
      ...(q.statut ? { statut: q.statut } : {})
    };

    // NOTE: filtrage ST fin peut être renforcé quand un vrai rôle ST existera.

    const items = await prisma.journalEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    });
    return { items };
  });

  // POST /journal (EE ou ST future)
  app.post(
    "/journal",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const parsed = createJournalSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
      }

      const entrepriseId = req.user.entrepriseId;

      // Sécurité multi-tenant : chantier doit appartenir à l'entreprise
      const chantier = await prisma.chantier.findFirst({
        where: { id: parsed.data.chantierId, entrepriseId },
        select: { id: true }
      });
      if (!chantier) return reply.status(404).send({ error: "Chantier not found" });

      // PlanningTask doit appartenir au chantier
      const task = await prisma.planningTask.findFirst({
        where: { id: parsed.data.planningTaskId, chantierId: parsed.data.chantierId },
        select: { id: true }
      });
      if (!task) return reply.status(404).send({ error: "Planning task not found" });

      const auteurType = (req.user.role === "ADMIN" || req.user.role === "CONDUCTEUR") ? "EE" : "ST";
      const date = new Date(parsed.data.date);
      if (Number.isNaN(date.getTime())) {
        return reply.status(400).send({ error: "Invalid date" });
      }

      const entry = await prisma.journalEntry.create({
        data: {
          chantierId: parsed.data.chantierId,
          planningTaskId: parsed.data.planningTaskId,
          sousTraitantId: parsed.data.sousTraitantId,
          auteurId: req.user.id,
          auteurType: auteurType as any,
          date,
          avancement: parsed.data.avancement,
          commentaire: parsed.data.commentaire,
          photos: parsed.data.photos ?? undefined,
          aleas: parsed.data.aleas ?? undefined
        }
      });

      return reply.status(201).send({ item: entry });
    }
  );

  // GET /journal/:id
  app.get("/journal/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const id = (req.params as any).id as string;
    const entrepriseId = req.user.entrepriseId;
    const item = await prisma.journalEntry.findFirst({ where: { id, chantier: { entrepriseId } } });
    if (!item) return reply.status(404).send({ error: "Not found" });
    return { item };
  });

  // POST /journal/:id/decision (EE)
  app.post(
    "/journal/:id/decision",
    { preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"]) ] },
    async (req, reply) => {
      const id = (req.params as any).id as string;
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

      const entrepriseId = req.user.entrepriseId;
      const existing = await prisma.journalEntry.findFirst({
        where: { id, chantier: { entrepriseId } },
        select: { id: true, statut: true, chantierId: true, planningTaskId: true }
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });

      const statut = parsed.data.decision === "VALIDATE" ? "VALIDATED" : "REFUSED";

      const updated = await prisma.journalEntry.update({
        where: { id },
        data: {
          statut: statut as any,
          decisionCommentaire: parsed.data.commentaireEE,
          decidedById: req.user.id,
          decidedAt: new Date()
        }
      });

      // Déclencheurs MVP : créer/mettre à jour une alerte si refus ou si avancement < 0 (impossible)
      if (statut === "REFUSED") {
        await prisma.alerte.create({
          data: {
            chantierId: updated.chantierId,
            type: "JOURNAL_REFUSE",
            niveau: "WARNING" as any,
            source: "JOURNAL" as any,
            message: `Entrée journal refusée (${updated.id})`,
            journalEntryId: updated.id,
            planningTaskId: updated.planningTaskId
          }
        });
      }

      return { item: updated };
    }
  );
}
