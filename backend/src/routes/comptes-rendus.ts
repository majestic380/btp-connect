// ============================================
// 🏗️ BTP CONNECT v9.0 - ROUTES COMPTES RENDUS
// Compte Rendu de Chantier
// ============================================

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";
import { generateCRPDF } from "../services/pdf-generator.js";
import { sendCREmail } from "../services/email.js";

// Schémas de validation
const createCRSchema = z.object({
  chantierId: z.string().uuid(),
  dateReunion: z.string().datetime(),
  heureDebut: z.string().optional(),
  heureFin: z.string().optional(),
  lieu: z.string().optional(),
  objetReunion: z.string().optional(),
  meteo: z.string().optional(),
  effectifChantier: z.number().int().optional(),
});

const updateCRSchema = createCRSchema.partial().extend({
  observations: z.string().optional(),
  prochainCR: z.string().datetime().optional(),
});

const participantSchema = z.object({
  nom: z.string().min(1),
  societe: z.string().min(1), // societe est requis dans le schéma Prisma
  role: z.string().optional(), // utilisé à la place de fonction
  email: z.string().email().optional(),
  telephone: z.string().optional(),
  statut: z.enum(["PRESENT", "ABSENT", "EXCUSE"]),
});

const actionSchema = z.object({
  description: z.string().min(1),
  responsable: z.string().min(1),
  societe: z.string().optional(),
  echeance: z.string().datetime(),
  priorite: z.enum(["BASSE", "NORMALE", "HAUTE", "URGENTE"]).optional(),
});

const avancementSchema = z.object({
  lot: z.string().min(1),
  entreprise: z.string().min(1), // requis dans le schéma Prisma
  pourcentage: z.number().min(0).max(100),
  conformePlanning: z.boolean().default(true),
  retardJours: z.number().int().default(0),
  commentaire: z.string().optional(),
});

export async function comptesRendusRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────
  // COMPTES RENDUS - CRUD
  // ─────────────────────────────────────────────

  // Liste des CR d'un chantier
  app.get("/chantiers/:chantierId/cr", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chantierId } = req.params as { chantierId: string };
    const entrepriseId = req.user.entrepriseId;

    const chantier = await prisma.chantier.findFirst({
      where: { id: chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier non trouvé" });

    const crs = await prisma.compteRendu.findMany({
      where: { chantierId },
      include: {
        _count: {
          select: { participants: true, actions: true, avancements: true }
        }
      },
      orderBy: { numero: "desc" }
    });

    return { items: crs };
  });

  // Liste globale des CR (tous chantiers)
  app.get("/cr", { preHandler: [app.authenticate] }, async (req) => {
    const entrepriseId = req.user.entrepriseId;
    const query = req.query as { chantierId?: string; limit?: string };

    const where: any = {
      chantier: { entrepriseId }
    };
    if (query.chantierId) where.chantierId = query.chantierId;

    const crs = await prisma.compteRendu.findMany({
      where,
      include: {
        chantier: { select: { id: true, nom: true, reference: true } },
        _count: {
          select: { participants: true, actions: true, avancements: true }
        }
      },
      orderBy: { dateReunion: "desc" },
      take: query.limit ? parseInt(query.limit) : 50
    });

    return { items: crs };
  });

  // Détail d'un CR
  app.get("/cr/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: true,
        participants: { orderBy: { nom: "asc" } },
        actions: { 
          orderBy: [{ statut: "asc" }, { echeance: "asc" }]
        },
        avancements: { orderBy: { lot: "asc" } },
        pointsSecurite: true,
        ecartsMarche: true
      }
    });

    if (!cr) return reply.status(404).send({ error: "Compte rendu non trouvé" });
    return { item: cr };
  });

  // Créer un nouveau CR
  app.post("/chantiers/:chantierId/cr", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { chantierId } = req.params as { chantierId: string };
    const parsed = createCRSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }
    const data = { ...parsed.data, chantierId };

    const entrepriseId = req.user.entrepriseId;
    const chantier = await prisma.chantier.findFirst({
      where: { id: chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(404).send({ error: "Chantier non trouvé" });

    // Récupérer le dernier numéro
    const dernierCR = await prisma.compteRendu.findFirst({
      where: { chantierId },
      orderBy: { numero: "desc" }
    });
    const numero = (dernierCR?.numero || 0) + 1;

    const cr = await prisma.compteRendu.create({
      data: {
        chantierId,
        numero,
        dateReunion: new Date(parsed.data.dateReunion),
        heureDebut: parsed.data.heureDebut,
        heureFin: parsed.data.heureFin,
        lieu: parsed.data.lieu,
        objetReunion: parsed.data.objetReunion,
        meteo: parsed.data.meteo,
        effectifChantier: parsed.data.effectifChantier
      }
    });

    return { item: cr };
  });

  // Mettre à jour un CR
  app.patch("/cr/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateCRSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "CR non trouvé" });

    const data: any = { ...parsed.data };
    if (data.dateReunion) data.dateReunion = new Date(data.dateReunion);
    if (data.prochainCR) data.prochainCR = new Date(data.prochainCR);

    const cr = await prisma.compteRendu.update({
      where: { id },
      data
    });

    return { item: cr };
  });

  // Supprimer un CR
  app.delete("/cr/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const existing = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "CR non trouvé" });

    await prisma.compteRendu.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // DUPLIQUER UN CR (pour le suivant)
  // ─────────────────────────────────────────────

  app.post("/cr/:id/dupliquer", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { dateReunion: string };
    const entrepriseId = req.user.entrepriseId;

    const crOrigine = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        participants: true,
        actions: { where: { statut: { in: ["A_FAIRE", "EN_COURS"] } } },
        avancements: true
      }
    });

    if (!crOrigine) return reply.status(404).send({ error: "CR non trouvé" });

    // Créer le nouveau CR
    const nouveauCR = await prisma.compteRendu.create({
      data: {
        chantierId: crOrigine.chantierId,
        numero: crOrigine.numero + 1,
        dateReunion: new Date(body.dateReunion),
        heureDebut: crOrigine.heureDebut,
        lieu: crOrigine.lieu,
        objetReunion: "Réunion de chantier",
        effectifChantier: crOrigine.effectifChantier
      }
    });

    // Copier les participants
    for (const p of crOrigine.participants) {
      await prisma.participantCR.create({
        data: {
          compteRenduId: nouveauCR.id,
          nom: p.nom,
          societe: p.societe,
          role: p.role,
          email: p.email,
          telephone: p.telephone,
          statut: "PRESENT" // Réinitialiser le statut
        }
      });
    }

    // Reporter les actions non terminées
    for (const a of crOrigine.actions) {
      await prisma.actionCR.create({
        data: {
          compteRenduId: nouveauCR.id,
          numero: a.numero,
          description: a.description,
          responsable: a.responsable,
          societe: a.societe,
          echeance: a.echeance,
          priorite: a.priorite,
          statut: a.statut
        }
      });
    }

    // Copier les avancements (avec les dernières valeurs)
    for (const av of crOrigine.avancements) {
      await prisma.avancementLot.create({
        data: {
          compteRenduId: nouveauCR.id,
          lot: av.lot,
          entreprise: av.entreprise,
          pourcentage: av.pourcentage,
          conformePlanning: av.conformePlanning,
          retardJours: av.retardJours
        }
      });
    }

    return { item: nouveauCR };
  });

  // ─────────────────────────────────────────────
  // PARTICIPANTS
  // ─────────────────────────────────────────────

  app.get("/cr/:id/participants", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const participants = await prisma.participantCR.findMany({
      where: { compteRenduId: id },
      orderBy: { nom: "asc" }
    });

    return { items: participants };
  });

  app.post("/cr/:id/participants", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = participantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const participant = await prisma.participantCR.create({
      data: {
        compteRenduId: id,
        ...parsed.data
      }
    });

    return { item: participant };
  });

  app.patch("/cr/:crId/participants/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { crId, id } = req.params as { crId: string; id: string };
    const parsed = participantSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id: crId, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const participant = await prisma.participantCR.update({
      where: { id },
      data: parsed.data
    });

    return { item: participant };
  });

  app.delete("/cr/:crId/participants/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { crId, id } = req.params as { crId: string; id: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id: crId, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    await prisma.participantCR.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────

  app.get("/cr/:id/actions", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { statut?: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const where: any = { compteRenduId: id };
    if (query.statut) where.statut = query.statut;

    const actions = await prisma.actionCR.findMany({
      where,
      orderBy: [{ statut: "asc" }, { echeance: "asc" }]
    });

    return { items: actions };
  });

  app.post("/cr/:id/actions", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: { actions: { orderBy: { numero: "desc" }, take: 1 } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const dernierNumero = cr.actions[0]?.numero || 0;

    const action = await prisma.actionCR.create({
      data: {
        compteRenduId: id,
        numero: dernierNumero + 1,
        description: parsed.data.description,
        responsable: parsed.data.responsable,
        societe: parsed.data.societe,
        echeance: new Date(parsed.data.echeance),
        priorite: parsed.data.priorite || "NORMALE",
        statut: "A_FAIRE"
      }
    });

    return { item: action };
  });

  app.patch("/actions/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      description?: string;
      responsable?: string;
      echeance?: string;
      statut?: "A_FAIRE" | "EN_COURS" | "FAIT" | "ANNULE";
      commentaire?: string;
    };

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.actionCR.findFirst({
      where: { id, compteRendu: { chantier: { entrepriseId } } }
    });
    if (!existing) return reply.status(404).send({ error: "Action non trouvée" });

    const data: any = { ...body };
    if (data.echeance) data.echeance = new Date(data.echeance);
    if (data.statut === "FAIT") data.dateCloture = new Date();

    const action = await prisma.actionCR.update({
      where: { id },
      data
    });

    return { item: action };
  });

  // ─────────────────────────────────────────────
  // AVANCEMENTS PAR LOT
  // ─────────────────────────────────────────────

  app.get("/cr/:id/avancements", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const avancements = await prisma.avancementLot.findMany({
      where: { compteRenduId: id },
      orderBy: { lot: "asc" }
    });

    return { items: avancements };
  });

  app.post("/cr/:id/avancements", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = avancementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const avancement = await prisma.avancementLot.create({
      data: {
        compteRenduId: id,
        ...parsed.data
      }
    });

    return { item: avancement };
  });

  app.patch("/cr/:crId/avancements/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { crId, id } = req.params as { crId: string; id: string };
    const parsed = avancementSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id: crId, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const avancement = await prisma.avancementLot.update({
      where: { id },
      data: parsed.data
    });

    return { item: avancement };
  });

  // ─────────────────────────────────────────────
  // POINTS SÉCURITÉ
  // ─────────────────────────────────────────────

  app.post("/cr/:id/securite", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      type: "SECURITE" | "ENVIRONNEMENT";
      libelle?: string;
      description?: string;
      categorie?: string;
      conforme?: boolean;
      observation?: string;
      constat?: string;
      actionCorrective?: string;
      responsable?: string;
      statut?: string;
    };

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const point = await prisma.pointSecurite.create({
      data: {
        compteRenduId: id,
        type: body.type,
        libelle: body.libelle || body.description || "",
        conforme: body.conforme ?? (body.statut === "OK"),
        observation: body.observation || body.constat,
        actionCorrective: body.actionCorrective,
        responsable: body.responsable,
        categorie: body.categorie
      }
    });

    return { item: point };
  });

  // ─────────────────────────────────────────────
  // ÉCARTS MARCHÉ
  // ─────────────────────────────────────────────

  app.post("/cr/:id/ecarts", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      lot?: string;
      entreprise?: string;
      designation?: string;
      description?: string;
      impactFinancier?: number;
      impactDelai?: number;
      statut?: string;
      actionProposee?: string;
      actionRequise?: string;
    };

    const entrepriseId = req.user.entrepriseId;
    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const ecart = await prisma.ecartMarche.create({
      data: {
        compteRenduId: id,
        lot: body.lot || "",
        entreprise: body.entreprise,
        description: body.designation || body.description || "",
        impactFinancier: body.impactFinancier,
        impactDelai: body.impactDelai,
        statut: body.statut || "OUVERT",
        actionRequise: body.actionProposee || body.actionRequise
      }
    });

    return { item: ecart };
  });

  // ─────────────────────────────────────────────
  // GÉNÉRATION PDF
  // ─────────────────────────────────────────────

  app.get("/cr/:id/pdf", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: true,
        participants: { orderBy: { nom: "asc" } },
        actions: { orderBy: [{ statut: "asc" }, { echeance: "asc" }] },
        avancements: { orderBy: { lot: "asc" } },
        pointsSecurite: true,
        ecartsMarche: true
      }
    });

    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    // Récupérer info entreprise
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { entreprise: true }
    });

    // Préparer les données pour le PDF
    const pdfData = {
      cr: {
        numero: cr.numero,
        dateReunion: cr.dateReunion,
        heureDebut: cr.heureDebut || undefined,
        heureFin: cr.heureFin || undefined,
        lieu: cr.lieu || undefined,
        objetReunion: cr.objetReunion || undefined,
        meteo: cr.meteo || undefined,
        effectifChantier: cr.effectifChantier || undefined
      },
      chantier: {
        nom: cr.chantier.nom,
        adresse: cr.chantier.adresse || undefined,
        client: cr.chantier.client || undefined
      },
      participants: cr.participants.map(p => ({
        nom: p.nom,
        societe: p.societe || undefined,
        fonction: p.role || undefined, // role est utilisé à la place de fonction
        statut: p.statut
      })),
      actions: cr.actions.map((a, i) => ({
        numero: a.numero || i + 1,
        description: a.description,
        responsable: a.responsable,
        echeance: a.echeance,
        statut: a.statut
      })),
      avancements: cr.avancements.map(av => ({
        lot: av.lot,
        entreprise: av.entreprise || undefined,
        pourcentage: av.pourcentage,
        conformePlanning: av.conformePlanning,
        retardJours: av.retardJours || 0
      })),
      pointsSecurite: cr.pointsSecurite?.map(pt => ({
        type: pt.type,
        description: pt.libelle, // libelle est utilisé à la place de description
        conforme: pt.conforme
      })),
      entreprise: user?.entreprise ? {
        nom: user.entreprise.nom,
        logo: user.entreprise.logo || undefined
      } : undefined
    };

    try {
      const pdfBuffer = await generateCRPDF(pdfData);
      
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', 
        `attachment; filename="CR-${cr.numero}-${cr.chantier.nom.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
      
      return reply.send(pdfBuffer);
    } catch (error) {
      console.error('Erreur génération PDF CR:', error);
      return reply.status(500).send({ 
        error: "Erreur génération PDF",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ─────────────────────────────────────────────
  // ENVOI PAR EMAIL
  // ─────────────────────────────────────────────

  app.post("/cr/:id/envoyer", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { 
      destinataires: string[];
      inclurePDF?: boolean;
    };
    const entrepriseId = req.user.entrepriseId;

    if (!body.destinataires || body.destinataires.length === 0) {
      return reply.status(400).send({ error: "Au moins un destinataire requis" });
    }

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: true,
        participants: { orderBy: { nom: "asc" } },
        actions: { orderBy: [{ statut: "asc" }, { echeance: "asc" }] },
        avancements: { orderBy: { lot: "asc" } },
        pointsSecurite: true
      }
    });

    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    // Récupérer info entreprise
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { entreprise: true }
    });

    // Générer le PDF si demandé
    let pdfBuffer: Buffer | undefined;
    if (body.inclurePDF !== false) {
      try {
        const pdfData = {
          cr: {
            numero: cr.numero,
            dateReunion: cr.dateReunion,
            heureDebut: cr.heureDebut || undefined,
            heureFin: cr.heureFin || undefined,
            lieu: cr.lieu || undefined,
            objetReunion: cr.objetReunion || undefined,
            meteo: cr.meteo || undefined,
            effectifChantier: cr.effectifChantier || undefined
          },
          chantier: {
            nom: cr.chantier.nom,
            adresse: cr.chantier.adresse || undefined,
            client: cr.chantier.client || undefined
          },
          participants: cr.participants.map(p => ({
            nom: p.nom,
            societe: p.societe || undefined,
            fonction: p.role || undefined, // role est utilisé à la place de fonction
            statut: p.statut
          })),
          actions: cr.actions.map((a, i) => ({
            numero: a.numero || i + 1,
            description: a.description,
            responsable: a.responsable,
            echeance: a.echeance,
            statut: a.statut
          })),
          avancements: cr.avancements.map(av => ({
            lot: av.lot,
            entreprise: av.entreprise || undefined,
            pourcentage: av.pourcentage,
            conformePlanning: av.conformePlanning,
            retardJours: av.retardJours || 0
          })),
          pointsSecurite: cr.pointsSecurite?.map(pt => ({
            type: pt.type,
            description: pt.libelle, // libelle est utilisé à la place de description  
            conforme: pt.conforme
          })),
          entreprise: user?.entreprise ? {
            nom: user.entreprise.nom,
            logo: user.entreprise.logo || undefined
          } : undefined
        };
        
        pdfBuffer = await generateCRPDF(pdfData);
      } catch (error) {
        console.error('Erreur génération PDF pour email:', error);
        // Continue sans PDF
      }
    }

    // Envoyer l'email
    const result = await sendCREmail({
      destinataires: body.destinataires,
      crNumero: cr.numero,
      chantierNom: cr.chantier.nom,
      dateReunion: cr.dateReunion,
      pdfBuffer,
      entrepriseNom: user?.entreprise?.nom
    });

    if (!result.success) {
      return reply.status(500).send({ 
        error: "Erreur envoi email",
        details: result.error
      });
    }

    // Marquer le CR comme diffusé
    await prisma.compteRendu.update({
      where: { id },
      data: { 
        diffuse: true,
        dateDiffusion: new Date()
      }
    });

    return { 
      success: true, 
      messageId: result.messageId,
      previewUrl: result.previewUrl,
      destinataires: body.destinataires.length
    };
  });

  // Envoyer à tous les participants avec email
  app.post("/cr/:id/envoyer-participants", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const cr = await prisma.compteRendu.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: true,
        participants: { where: { email: { not: null } } }
      }
    });

    if (!cr) return reply.status(404).send({ error: "CR non trouvé" });

    const emails = cr.participants
      .map(p => p.email)
      .filter((e): e is string => e !== null && e.length > 0);

    if (emails.length === 0) {
      return reply.status(400).send({ error: "Aucun participant avec email" });
    }

    // Réutiliser la logique d'envoi
    const body = { destinataires: emails, inclurePDF: true };
    
    // Simuler un appel à /cr/:id/envoyer
    // (En production, on extrairait la logique dans une fonction partagée)
    return reply.redirect(307, `/cr/${id}/envoyer`);
  });
}
