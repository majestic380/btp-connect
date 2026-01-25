// ============================================
// 🏗️ BTP CONNECT v9.0 - ROUTES VISIONNEUSE
// Plans 2D/3D & Annotations BCF
// ============================================

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";

// Schémas de validation
const createPlanSchema = z.object({
  chantierId: z.string().uuid(),
  nom: z.string().min(1),
  codification: z.string().optional(),
  indice: z.string().default("A"),
  lot: z.string().optional(),
  niveau: z.string().optional(),
  zone: z.string().optional(),
  type: z.enum(["PDF", "DWG", "DXF", "IFC", "RVT", "IMAGE"]).default("PDF"),
  fichierUrl: z.string().url(),
  fichierNom: z.string(),
  tailleFichier: z.number().int().positive(),
  coordOrigineX: z.number().optional(),
  coordOrigineY: z.number().optional(),
  coordOrigineZ: z.number().optional(),
  echelle: z.number().optional(),
});

const updatePlanSchema = createPlanSchema.partial();

const createAnnotationSchema = z.object({
  type: z.enum(["ISSUE", "COMMENT", "REQUEST"]).default("ISSUE"),
  titre: z.string().min(1),
  description: z.string().optional(),
  priorite: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  cameraX: z.number().optional(),
  cameraY: z.number().optional(),
  cameraZ: z.number().optional(),
  cameraDirectionX: z.number().optional(),
  cameraDirectionY: z.number().optional(),
  cameraDirectionZ: z.number().optional(),
  assigneA: z.string().optional(),
  assigneEmail: z.string().email().optional(),
  dueDate: z.string().datetime().optional(),
  snapshotUrl: z.string().url().optional(),
});

const updateAnnotationSchema = createAnnotationSchema.partial().extend({
  statut: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});

export async function visionneuseRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────
  // DOCUMENTS / PLANS - CRUD
  // ─────────────────────────────────────────────

  app.get("/chantiers/:chantierId/plans", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chantierId } = req.params as { chantierId: string };
    const query = req.query as { lot?: string; type?: string; niveau?: string };
    const entrepriseId = req.user.entrepriseId;

    const chantier = await prisma.chantier.findFirst({
      where: { id: chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier non trouvé" });

    const where: any = { chantierId };
    if (query.lot) where.lot = query.lot;
    if (query.type) where.type = query.type;
    if (query.niveau) where.niveau = query.niveau;

    const plans = await prisma.documentPlan.findMany({
      where,
      include: { _count: { select: { annotations: true } } },
      orderBy: [{ lot: "asc" }, { codification: "asc" }, { indice: "desc" }]
    });

    const parLot: Record<string, typeof plans> = {};
    plans.forEach(p => {
      const lot = p.lot || "Sans lot";
      if (!parLot[lot]) parLot[lot] = [];
      parLot[lot].push(p);
    });

    return { items: plans, parLot };
  });

  app.get("/plans/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const plan = await prisma.documentPlan.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: { select: { id: true, nom: true, reference: true } },
        annotations: {
          orderBy: { createdAt: "desc" },
          include: { createur: { select: { id: true, nom: true, prenom: true } } }
        }
      }
    });

    if (!plan) return reply.status(404).send({ error: "Plan non trouvé" });
    return { item: plan };
  });

  app.post("/chantiers/:chantierId/plans", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { chantierId } = req.params as { chantierId: string };
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const chantier = await prisma.chantier.findFirst({
      where: { id: chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier non trouvé" });

    const data = { ...parsed.data, chantierId };
    const plan = await prisma.documentPlan.create({
      data: {
        chantierId,
        nom: data.nom,
        codification: data.codification,
        indice: data.indice,
        lot: data.lot,
        niveau: data.niveau,
        zone: data.zone,
        type: data.type,
        fichierUrl: data.fichierUrl,
        fichierNom: data.fichierNom,
        tailleFichier: data.tailleFichier,
        coordOrigineX: data.coordOrigineX,
        coordOrigineY: data.coordOrigineY,
        coordOrigineZ: data.coordOrigineZ,
        echelle: data.echelle
      }
    });

    return { item: plan };
  });

  app.patch("/plans/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.documentPlan.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Plan non trouvé" });

    const plan = await prisma.documentPlan.update({
      where: { id },
      data: parsed.data
    });

    return { item: plan };
  });

  app.delete("/plans/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const existing = await prisma.documentPlan.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Plan non trouvé" });

    await prisma.documentPlan.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // ANNOTATIONS BCF
  // ─────────────────────────────────────────────

  app.get("/plans/:planId/annotations", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const query = req.query as { statut?: string; type?: string; assigneA?: string };
    const entrepriseId = req.user.entrepriseId;

    const plan = await prisma.documentPlan.findFirst({
      where: { id: planId, chantier: { entrepriseId } }
    });
    if (!plan) return reply.status(404).send({ error: "Plan non trouvé" });

    const where: any = { documentPlanId: planId };
    if (query.statut) where.statut = query.statut;
    if (query.type) where.type = query.type;
    if (query.assigneA) where.assigneA = query.assigneA;

    const annotations = await prisma.annotationBCF.findMany({
      where,
      include: { createur: { select: { id: true, nom: true, prenom: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });

    const stats = {
      total: annotations.length,
      open: annotations.filter(a => a.statut === "OPEN").length,
      inProgress: annotations.filter(a => a.statut === "IN_PROGRESS").length,
      resolved: annotations.filter(a => a.statut === "RESOLVED").length,
      closed: annotations.filter(a => a.statut === "CLOSED").length,
      critical: annotations.filter(a => a.priorite === "CRITICAL").length
    };

    return { items: annotations, stats };
  });

  app.post("/plans/:planId/annotations", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const parsed = createAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const plan = await prisma.documentPlan.findFirst({
      where: { id: planId, chantier: { entrepriseId } }
    });
    if (!plan) return reply.status(404).send({ error: "Plan non trouvé" });

    const data = parsed.data;
    const annotation = await prisma.annotationBCF.create({
      data: {
        documentPlanId: planId,
        createurId: req.user.sub,
        type: data.type,
        titre: data.titre,
        description: data.description,
        priorite: data.priorite,
        statut: "OPEN",
        positionX: data.positionX,
        positionY: data.positionY,
        positionZ: data.positionZ,
        cameraX: data.cameraX,
        cameraY: data.cameraY,
        cameraZ: data.cameraZ,
        cameraDirectionX: data.cameraDirectionX,
        cameraDirectionY: data.cameraDirectionY,
        cameraDirectionZ: data.cameraDirectionZ,
        assigneA: data.assigneA,
        assigneEmail: data.assigneEmail,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        snapshotUrl: data.snapshotUrl
      }
    });

    return { item: annotation };
  });

  app.patch("/annotations/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.annotationBCF.findFirst({
      where: { id, documentPlan: { chantier: { entrepriseId } } }
    });
    if (!existing) return reply.status(404).send({ error: "Annotation non trouvée" });

    const data: any = { ...parsed.data };
    if (data.dueDate) data.dueDate = new Date(data.dueDate);

    const annotation = await prisma.annotationBCF.update({
      where: { id },
      data
    });

    return { item: annotation };
  });

  app.delete("/annotations/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const existing = await prisma.annotationBCF.findFirst({
      where: { id, documentPlan: { chantier: { entrepriseId } } }
    });
    if (!existing) return reply.status(404).send({ error: "Annotation non trouvée" });

    await prisma.annotationBCF.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // EXPORT/IMPORT BCF
  // ─────────────────────────────────────────────

  app.get("/plans/:planId/bcf", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const entrepriseId = req.user.entrepriseId;

    const plan = await prisma.documentPlan.findFirst({
      where: { id: planId, chantier: { entrepriseId } },
      include: {
        chantier: true,
        annotations: { include: { createur: { select: { email: true, nom: true } } } }
      }
    });

    if (!plan) return reply.status(404).send({ error: "Plan non trouvé" });

    const bcfExport = {
      version: "2.1",
      project: { name: plan.chantier.nom, id: plan.chantierId },
      topics: plan.annotations.map(a => ({
        guid: a.guid,
        title: a.titre,
        description: a.description,
        creation_date: a.createdAt.toISOString(),
        creation_author: a.createur.email,
        modified_date: a.updatedAt.toISOString(),
        topic_type: a.type,
        topic_status: a.statut,
        priority: a.priorite,
        assigned_to: a.assigneEmail,
        due_date: a.dueDate?.toISOString(),
        viewpoints: [{
          guid: `${a.guid}-vp`,
          snapshot: a.snapshotUrl,
          camera: a.cameraX ? {
            camera_view_point: { x: a.cameraX, y: a.cameraY, z: a.cameraZ },
            camera_direction: { x: a.cameraDirectionX, y: a.cameraDirectionY, z: a.cameraDirectionZ }
          } : null,
          position: a.positionX ? { x: a.positionX, y: a.positionY, z: a.positionZ } : null
        }]
      }))
    };

    reply.header("Content-Type", "application/json");
    reply.header("Content-Disposition", `attachment; filename="bcf-${plan.codification || plan.id}.json"`);
    return bcfExport;
  });

  app.post("/plans/:planId/bcf", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { planId } = req.params as { planId: string };
    const body = req.body as {
      topics: Array<{
        guid?: string;
        title: string;
        description?: string;
        topic_type?: string;
        topic_status?: string;
        priority?: string;
        assigned_to?: string;
        due_date?: string;
        viewpoints?: Array<{
          snapshot?: string;
          camera?: { camera_view_point?: { x: number; y: number; z: number }; camera_direction?: { x: number; y: number; z: number } };
          position?: { x: number; y: number; z: number };
        }>;
      }>;
    };

    const entrepriseId = req.user.entrepriseId;
    const plan = await prisma.documentPlan.findFirst({
      where: { id: planId, chantier: { entrepriseId } }
    });
    if (!plan) return reply.status(404).send({ error: "Plan non trouvé" });

    if (!body.topics || !Array.isArray(body.topics)) {
      return reply.status(400).send({ error: "Format BCF invalide" });
    }

    const imported = [];
    for (const topic of body.topics) {
      const vp = topic.viewpoints?.[0];
      const annotation = await prisma.annotationBCF.create({
        data: {
          documentPlanId: planId,
          createurId: req.user.sub,
          guid: topic.guid,
          type: (topic.topic_type as any) || "ISSUE",
          titre: topic.title,
          description: topic.description,
          statut: (topic.topic_status as any) || "OPEN",
          priorite: (topic.priority as any) || "NORMAL",
          assigneEmail: topic.assigned_to,
          dueDate: topic.due_date ? new Date(topic.due_date) : null,
          snapshotUrl: vp?.snapshot,
          positionX: vp?.position?.x,
          positionY: vp?.position?.y,
          positionZ: vp?.position?.z,
          cameraX: vp?.camera?.camera_view_point?.x,
          cameraY: vp?.camera?.camera_view_point?.y,
          cameraZ: vp?.camera?.camera_view_point?.z,
          cameraDirectionX: vp?.camera?.camera_direction?.x,
          cameraDirectionY: vp?.camera?.camera_direction?.y,
          cameraDirectionZ: vp?.camera?.camera_direction?.z
        }
      });
      imported.push(annotation);
    }

    return { success: true, imported: imported.length, items: imported };
  });

  // ─────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────

  app.get("/chantiers/:chantierId/plans/stats", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chantierId } = req.params as { chantierId: string };
    const entrepriseId = req.user.entrepriseId;

    const chantier = await prisma.chantier.findFirst({
      where: { id: chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier non trouvé" });

    const plans = await prisma.documentPlan.findMany({
      where: { chantierId },
      include: { _count: { select: { annotations: true } } }
    });

    const annotations = await prisma.annotationBCF.findMany({
      where: { documentPlan: { chantierId } }
    });

    const parType: Record<string, number> = {};
    plans.forEach(p => { parType[p.type] = (parType[p.type] || 0) + 1; });

    const parLot: Record<string, number> = {};
    plans.forEach(p => { parLot[p.lot || "Sans lot"] = (parLot[p.lot || "Sans lot"] || 0) + 1; });

    return {
      totalPlans: plans.length,
      totalAnnotations: annotations.length,
      tailleTotale: plans.reduce((sum, p) => sum + p.tailleFichier, 0),
      parType,
      parLot,
      annotationsParStatut: {
        OPEN: annotations.filter(a => a.statut === "OPEN").length,
        IN_PROGRESS: annotations.filter(a => a.statut === "IN_PROGRESS").length,
        RESOLVED: annotations.filter(a => a.statut === "RESOLVED").length,
        CLOSED: annotations.filter(a => a.statut === "CLOSED").length
      },
      annotationsParPriorite: {
        LOW: annotations.filter(a => a.priorite === "LOW").length,
        NORMAL: annotations.filter(a => a.priorite === "NORMAL").length,
        HIGH: annotations.filter(a => a.priorite === "HIGH").length,
        CRITICAL: annotations.filter(a => a.priorite === "CRITICAL").length
      }
    };
  });
}
