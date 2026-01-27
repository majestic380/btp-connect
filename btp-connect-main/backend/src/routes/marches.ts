// ============================================
// 🏗️ BTP CONNECT v9.0 - ROUTES MARCHÉS
// Suivi Financier des Marchés
// ============================================

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";
import { parseDPGFFile, previewDPGFFile, validateMapping, type DPGFMapping } from "../services/dpgf-import.js";
import { generateSituationPDF, bufferToStream } from "../services/pdf-generator.js";

// Schémas de validation
const createMarcheSchema = z.object({
  chantierId: z.string().uuid(),
  sousTraitantId: z.string().uuid(),
  reference: z.string().min(1),
  type: z.enum(["PUBLIC", "PRIVE"]),
  objet: z.string().min(1),
  lot: z.string().optional(),
  montantInitialHT: z.number().positive(),
  dateNotification: z.string().datetime().optional(),
  delaiExecution: z.number().int().positive().optional(),
  tauxRG: z.number().min(0).max(100).default(5),
  cautionBancaire: z.boolean().default(false),
  // Infos Chorus (marchés publics)
  codeService: z.string().optional(),
  numeroEngagement: z.string().optional(),
});

const updateMarcheSchema = createMarcheSchema.partial();

const createSituationSchema = z.object({
  mois: z.string().datetime(),
  observations: z.string().optional(),
});

const lignesSituationSchema = z.array(z.object({
  ligneDPGFId: z.string().uuid(),
  quantiteMois: z.number().min(0),
}));

export async function marchesRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────
  // MARCHÉS - CRUD
  // ─────────────────────────────────────────────

  // Liste des marchés
  app.get("/marches", { preHandler: [app.authenticate] }, async (req) => {
    const entrepriseId = req.user.entrepriseId;
    const query = req.query as { chantierId?: string; statut?: string };

    const where: any = {
      chantier: { entrepriseId }
    };
    if (query.chantierId) where.chantierId = query.chantierId;
    if (query.statut) where.statut = query.statut;

    const marches = await prisma.marche.findMany({
      where,
      include: {
        chantier: { select: { id: true, nom: true, reference: true } },
        sousTraitant: { select: { id: true, nom: true, siret: true } },
        _count: { select: { situations: true, avenants: true, ftm: true } }
      },
      orderBy: { updatedAt: "desc" }
    });

    // Calculer avancement financier
    const items = await Promise.all(marches.map(async (m) => {
      const situationsPayees = await prisma.situation.aggregate({
        where: { marcheId: m.id, statut: { in: ["VALIDEE_MOA", "PAYEE"] } },
        _sum: { montantTravaux: true }
      });
      const montantFacture = Number(situationsPayees._sum.montantTravaux || 0);
      const avancementFinancier = m.montantActuelHT.toNumber() > 0 
        ? Math.round((montantFacture / m.montantActuelHT.toNumber()) * 100) 
        : 0;
      
      return {
        ...m,
        montantFactureHT: montantFacture,
        avancementFinancier
      };
    }));

    return { items };
  });

  // Détail d'un marché
  app.get("/marches/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: true,
        sousTraitant: true,
        lignesDPGF: { orderBy: { numero: "asc" } },
        situations: { 
          orderBy: { numero: "desc" },
          include: { _count: { select: { lignes: true } } }
        },
        avenants: { orderBy: { numero: "asc" } },
        ftm: { orderBy: { createdAt: "desc" } },
        ordresService: { orderBy: { dateEffet: "desc" } }
      }
    });

    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });
    return { item: marche };
  });

  // Créer un marché
  app.post("/marches", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const parsed = createMarcheSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const data = parsed.data;

    // Vérifier que le chantier appartient à l'entreprise
    const chantier = await prisma.chantier.findFirst({
      where: { id: data.chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(400).send({ error: "Chantier invalide" });

    // Calculer date fin prévue
    const dateNotification = data.dateNotification ? new Date(data.dateNotification) : new Date();
    const dateFinPrevue = data.delaiExecution 
      ? new Date(dateNotification.getTime() + data.delaiExecution * 24 * 60 * 60 * 1000)
      : null;

    const marche = await prisma.marche.create({
      data: {
        chantierId: data.chantierId,
        sousTraitantId: data.sousTraitantId,
        reference: data.reference,
        type: data.type,
        objet: data.objet,
        lot: data.lot,
        montantInitialHT: data.montantInitialHT,
        montantActuelHT: data.montantInitialHT, // Égal au départ
        dateNotification: dateNotification,
        delaiExecution: data.delaiExecution || 0,
        dateFinPrevue: dateFinPrevue || dateNotification,
        tauxRG: data.tauxRG,
        cautionBancaire: data.cautionBancaire,
        statut: "EN_COURS"
      }
    });

    return { item: marche };
  });

  // Mettre à jour un marché
  app.patch("/marches/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateMarcheSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Marché non trouvé" });

    const marche = await prisma.marche.update({
      where: { id },
      data: parsed.data
    });

    return { item: marche };
  });

  // Supprimer un marché
  app.delete("/marches/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const existing = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Marché non trouvé" });

    await prisma.marche.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // IMPORT DPGF (Excel)
  // ─────────────────────────────────────────────

  app.post("/marches/:id/import-dpgf", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    // Le body contient les lignes parsées côté frontend
    const body = req.body as {
      lignes: Array<{
        numero: string;
        designation: string;
        unite: string;
        quantiteMarche: number;
        prixUnitaireHT: number;
        chapitre?: string;
        sousLot?: string;
      }>;
    };

    if (!body.lignes || !Array.isArray(body.lignes)) {
      return reply.status(400).send({ error: "Format invalide - lignes manquantes" });
    }

    // Supprimer les anciennes lignes
    await prisma.ligneDPGF.deleteMany({ where: { marcheId: id } });

    // Créer les nouvelles lignes
    let totalHT = 0;
    const lignesCreees = await Promise.all(body.lignes.map(async (ligne, index) => {
      const montantHT = ligne.quantiteMarche * ligne.prixUnitaireHT;
      totalHT += montantHT;
      
      return prisma.ligneDPGF.create({
        data: {
          marcheId: id,
          numero: ligne.numero || `${index + 1}`,
          designation: ligne.designation,
          unite: ligne.unite,
          quantite: ligne.quantiteMarche,
          prixUnitaireHT: ligne.prixUnitaireHT,
          montantHT,
          chapitre: ligne.chapitre,
          lot: ligne.sousLot
        }
      });
    }));

    // Mettre à jour le montant du marché
    await prisma.marche.update({
      where: { id },
      data: { 
        montantInitialHT: totalHT,
        montantActuelHT: totalHT
      }
    });

    return { 
      success: true, 
      lignesImportees: lignesCreees.length,
      montantTotalHT: totalHT
    };
  });

  // Preview DPGF (détecte colonnes avant import)
  app.post("/marches/:id/preview-dpgf", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    // Récupérer le fichier multipart
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Fichier requis" });

    const buffer = await data.toBuffer();
    
    try {
      const preview = previewDPGFFile(buffer);
      return {
        success: true,
        headers: preview.headers,
        sampleRows: preview.sampleRows,
        suggestedMapping: preview.suggestedMapping
      };
    } catch (error) {
      return reply.status(400).send({ 
        error: "Erreur lecture fichier",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Upload + Parse DPGF complet (avec mapping personnalisé optionnel)
  app.post("/marches/:id/upload-dpgf", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    // Récupérer le fichier et le mapping optionnel
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "Fichier requis" });

    const buffer = await data.toBuffer();
    
    // Parser le mapping depuis les fields si fourni
    let mapping: Partial<DPGFMapping> | undefined;
    const fields = data.fields;
    if (fields && typeof fields === 'object') {
      mapping = {};
      const fieldMap = fields as Record<string, any>;
      if (fieldMap.mapping?.value) {
        try {
          mapping = JSON.parse(fieldMap.mapping.value);
        } catch { /* ignore */ }
      }
    }

    // Parser le fichier DPGF
    const result = parseDPGFFile(buffer, mapping);
    
    if (!result.success) {
      return reply.status(400).send({ 
        error: "Erreur parsing DPGF",
        details: result.errors
      });
    }

    // Supprimer les anciennes lignes
    await prisma.ligneDPGF.deleteMany({ where: { marcheId: id } });

    // Créer les nouvelles lignes
    const lignesCreees = await Promise.all(result.lignes.map(async (ligne, index) => {
      return prisma.ligneDPGF.create({
        data: {
          marcheId: id,
          numero: ligne.numero,
          designation: ligne.designation,
          unite: ligne.unite,
          quantite: ligne.quantite,
          prixUnitaireHT: ligne.prixUnitaireHT,
          montantHT: ligne.montantHT,
          chapitre: ligne.chapitre,
          lot: ligne.lot
        }
      });
    }));

    // Mettre à jour le montant du marché
    await prisma.marche.update({
      where: { id },
      data: { 
        montantInitialHT: result.totalHT,
        montantActuelHT: result.totalHT
      }
    });

    return { 
      success: true, 
      lignesImportees: lignesCreees.length,
      montantTotalHT: result.totalHT,
      warnings: result.warnings
    };
  });

  // ─────────────────────────────────────────────
  // SITUATIONS DE TRAVAUX
  // ─────────────────────────────────────────────

  // Liste des situations d'un marché
  app.get("/marches/:id/situations", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const situations = await prisma.situation.findMany({
      where: { marcheId: id },
      include: {
        lignes: { include: { ligneDPGF: true } },
        validations: true
      },
      orderBy: { numero: "desc" }
    });

    return { items: situations };
  });

  // Créer une nouvelle situation
  app.post("/marches/:id/situations", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createSituationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: { situations: { orderBy: { numero: "desc" }, take: 1 } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const dernierNumero = marche.situations[0]?.numero || 0;
    const mois = new Date(parsed.data.mois);
    const dateDebut = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const dateFin = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);

    const situation = await prisma.situation.create({
      data: {
        marcheId: id,
        numero: dernierNumero + 1,
        mois: mois,
        dateDebut: dateDebut,
        dateFin: dateFin,
        montantTravaux: 0,
        montantCumule: 0,
        retenueGarantie: 0,
        acomptePrecedent: 0,
        montantNetHT: 0,
        montantTTC: 0,
        statut: "BROUILLON",
        chorusStatut: "NON_ENVOYE"
      }
    });

    return { item: situation };
  });

  // Détail d'une situation
  app.get("/situations/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId } } },
      include: {
        marche: {
          include: {
            lignesDPGF: { orderBy: { numero: "asc" } },
            sousTraitant: true,
            chantier: true
          }
        },
        lignes: { include: { ligneDPGF: true } },
        validations: true
      }
    });

    if (!situation) return reply.status(404).send({ error: "Situation non trouvée" });
    return { item: situation };
  });

  // Sauvegarder les lignes d'une situation
  app.put("/situations/:id/lignes", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = lignesSituationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId } } },
      include: { marche: { include: { lignesDPGF: true } } }
    });

    if (!situation) return reply.status(404).send({ error: "Situation non trouvée" });
    if (situation.statut !== "BROUILLON") {
      return reply.status(400).send({ error: "Situation non modifiable" });
    }

    // Supprimer les anciennes lignes situation
    await prisma.ligneSituation.deleteMany({ where: { situationId: id } });

    // Calculer et créer les nouvelles lignes
    let montantTravaux = 0;
    let montantCumul = 0;

    // Récupérer les quantités cumulées des situations précédentes
    const situationsPrecedentes = await prisma.situation.findMany({
      where: { 
        marcheId: situation.marcheId, 
        numero: { lt: situation.numero },
        statut: { not: "BROUILLON" }
      },
      include: { lignes: true }
    });

    const cumulsParLigne: Record<string, number> = {};
    situationsPrecedentes.forEach(sit => {
      sit.lignes.forEach(l => {
        cumulsParLigne[l.ligneDPGFId] = (cumulsParLigne[l.ligneDPGFId] || 0) + Number(l.quantiteMois);
      });
    });

    for (const ligne of parsed.data) {
      const ligneMarche = situation.marche.lignesDPGF.find(l => l.id === ligne.ligneDPGFId);
      if (!ligneMarche) continue;

      const quantiteCumulPrecedent = cumulsParLigne[ligne.ligneDPGFId] || 0;
      const quantiteCumul = quantiteCumulPrecedent + ligne.quantiteMois;
      const montantMois = ligne.quantiteMois * Number(ligneMarche.prixUnitaireHT);
      const montantCumulLigne = quantiteCumul * Number(ligneMarche.prixUnitaireHT);

      montantTravaux += montantMois;
      montantCumul += montantCumulLigne;

      await prisma.ligneSituation.create({
        data: {
          situationId: id,
          ligneDPGFId: ligne.ligneDPGFId,
          quantiteMois: ligne.quantiteMois,
          quantiteCumul: quantiteCumul,
          montantMois: montantMois,
          montantCumul: montantCumulLigne
        }
      });
    }

    // Calculer récap
    const retenueGarantie = montantCumul * (Number(situation.marche.tauxRG) / 100);
    const acomptePrecedent = situationsPrecedentes.reduce((sum, s) => 
      sum + Number(s.montantTravaux || 0), 0);
    const montantNetHT = montantCumul - retenueGarantie - acomptePrecedent;
    const montantTTC = montantNetHT * 1.20; // TVA 20% par défaut

    // Mettre à jour la situation
    const updated = await prisma.situation.update({
      where: { id },
      data: {
        montantTravaux,
        montantCumule: montantCumul,
        retenueGarantie,
        acomptePrecedent,
        montantNetHT,
        montantTTC
      }
    });

    return { item: updated };
  });

  // Soumettre une situation pour validation
  app.post("/situations/:id/soumettre", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId } } }
    });

    if (!situation) return reply.status(404).send({ error: "Situation non trouvée" });
    if (situation.statut !== "BROUILLON") {
      return reply.status(400).send({ error: "Situation déjà soumise" });
    }

    const updated = await prisma.situation.update({
      where: { id },
      data: { 
        statut: "SOUMISE",
        updatedAt: new Date()
      }
    });

    return { item: updated };
  });

  // Valider une situation (MOE ou MOA)
  app.post("/situations/:id/valider", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { type: "MOE" | "MOA"; commentaire?: string };
    const entrepriseId = req.user.entrepriseId;

    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId } } }
    });

    if (!situation) return reply.status(404).send({ error: "Situation non trouvée" });

    // Vérifier le workflow
    if (body.type === "MOE" && situation.statut !== "SOUMISE") {
      return reply.status(400).send({ error: "La situation doit être soumise pour validation MOE" });
    }
    if (body.type === "MOA" && situation.statut !== "VALIDEE_MOE") {
      return reply.status(400).send({ error: "La situation doit être validée MOE avant validation MOA" });
    }

    // Créer la validation
    await prisma.validationSituation.create({
      data: {
        situationId: id,
        type: body.type,
        statut: "VALIDE",
        commentaire: body.commentaire,
        userId: req.user.sub,
        dateValidation: new Date()
      }
    });

    // Mettre à jour le statut
    const nouveauStatut = body.type === "MOE" ? "VALIDEE_MOE" : "VALIDEE_MOA";
    const updated = await prisma.situation.update({
      where: { id },
      data: { statut: nouveauStatut }
    });

    return { item: updated };
  });

  // Refuser une situation
  app.post("/situations/:id/refuser", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { type: "MOE" | "MOA"; motif: string };
    const entrepriseId = req.user.entrepriseId;

    if (!body.motif) {
      return reply.status(400).send({ error: "Motif de refus requis" });
    }

    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId } } }
    });

    if (!situation) return reply.status(404).send({ error: "Situation non trouvée" });

    // Créer la validation avec refus
    await prisma.validationSituation.create({
      data: {
        situationId: id,
        type: body.type,
        statut: "REFUSE",
        commentaire: body.motif,
        userId: req.user.sub,
        dateValidation: new Date()
      }
    });

    // Remettre en brouillon
    const updated = await prisma.situation.update({
      where: { id },
      data: { 
        statut: "BROUILLON",
        updatedAt: body.motif
      }
    });

    return { item: updated };
  });

  // ─────────────────────────────────────────────
  // EXPORT PDF SITUATION
  // ─────────────────────────────────────────────

  app.get("/situations/:id/pdf", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const situation = await prisma.situation.findFirst({
      where: { id, marche: { chantier: { entrepriseId } } },
      include: {
        marche: {
          include: {
            chantier: true,
            sousTraitant: true,
            lignesDPGF: true
          }
        },
        lignes: {
          include: { ligneDPGF: true },
          orderBy: { ligneDPGF: { numero: "asc" } }
        }
      }
    });

    if (!situation) return reply.status(404).send({ error: "Situation non trouvée" });

    // Récupérer info entreprise
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { entreprise: true }
    });

    // Préparer les données pour le PDF
    const pdfData = {
      marche: {
        reference: situation.marche.reference,
        objet: situation.marche.objet,
        type: situation.marche.type,
        sousTraitant: {
          nom: situation.marche.sousTraitant.nom,
          siret: situation.marche.sousTraitant.siret || undefined,
          adresse: situation.marche.sousTraitant.adresse || undefined
        },
        chantier: {
          nom: situation.marche.chantier.nom,
          adresse: situation.marche.chantier.adresse || undefined,
          client: situation.marche.chantier.client || undefined
        },
        montantInitialHT: Number(situation.marche.montantInitialHT),
        montantActuelHT: Number(situation.marche.montantActuelHT),
        tauxRG: Number(situation.marche.tauxRG)
      },
      situation: {
        numero: situation.numero,
        mois: situation.mois,
        dateDebut: situation.dateDebut || situation.mois,
        dateFin: situation.dateFin || new Date(),
        montantTravaux: Number(situation.montantTravaux),
        montantCumule: Number(situation.montantCumule),
        retenueGarantie: Number(situation.retenueGarantie),
        acomptePrecedent: Number(situation.acomptePrecedent),
        montantNetHT: Number(situation.montantNetHT),
        tauxTVA: Number(situation.tauxTVA),
        montantTTC: Number(situation.montantTTC)
      },
      lignes: situation.lignes.map(l => ({
        numero: l.ligneDPGF.numero,
        designation: l.ligneDPGF.designation,
        unite: l.ligneDPGF.unite,
        quantiteMarche: Number(l.ligneDPGF.quantite),
        prixUnitaireHT: Number(l.ligneDPGF.prixUnitaireHT),
        quantiteMois: Number(l.quantiteMois),
        quantiteCumul: Number(l.quantiteCumul),
        montantMois: Number(l.montantMois),
        montantCumul: Number(l.montantCumul)
      })),
      entreprise: user?.entreprise ? {
        nom: user.entreprise.nom,
        siret: user.entreprise.siret || undefined,
        adresse: user.entreprise.adresse || undefined
      } : undefined
    };

    try {
      const pdfBuffer = await generateSituationPDF(pdfData);
      
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', 
        `attachment; filename="Situation-${situation.numero}-${situation.marche.reference}.pdf"`);
      
      return reply.send(pdfBuffer);
    } catch (error) {
      console.error('Erreur génération PDF situation:', error);
      return reply.status(500).send({ 
        error: "Erreur génération PDF",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ─────────────────────────────────────────────
  // AVENANTS
  // ─────────────────────────────────────────────

  app.get("/marches/:id/avenants", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const avenants = await prisma.avenant.findMany({
      where: { marcheId: id },
      orderBy: { numero: "asc" }
    });

    return { items: avenants };
  });

  app.post("/marches/:id/avenants", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      objet: string;
      montantHT: number;
      dateSignature?: string;
      justification?: string;
      motif?: string;
      impactDelai?: number;
    };

    const entrepriseId = req.user.entrepriseId;
    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: { avenants: { orderBy: { numero: "desc" }, take: 1 } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const dernierNumero = marche.avenants[0]?.numero || 0;

    const avenant = await prisma.avenant.create({
      data: {
        marcheId: id,
        numero: dernierNumero + 1,
        objet: body.objet,
        montantHT: body.montantHT,
        dateSignature: body.dateSignature ? new Date(body.dateSignature) : new Date(),
        motif: body.justification || body.motif,
        impactDelai: body.impactDelai || 0
      }
    });

    // Recalculer montant actuel du marché
    const totalAvenants = await prisma.avenant.aggregate({
      where: { marcheId: id },
      _sum: { montantHT: true }
    });
    
    await prisma.marche.update({
      where: { id },
      data: {
        montantActuelHT: Number(marche.montantInitialHT) + Number(totalAvenants._sum.montantHT || 0)
      }
    });

    return { item: avenant };
  });

  // ─────────────────────────────────────────────
  // FICHES TRAVAUX MODIFICATIFS (FTM)
  // ─────────────────────────────────────────────

  app.get("/marches/:id/ftm", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const ftms = await prisma.ficheTravauxModificatifs.findMany({
      where: { marcheId: id },
      orderBy: { createdAt: "desc" }
    });

    return { items: ftms };
  });

  app.post("/marches/:id/ftm", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      type: "TS_PLUS" | "TS_MOINS" | "TP" | "MOD";
      objet: string;
      description?: string;
      montantEstimeHT?: number;
    };

    const entrepriseId = req.user.entrepriseId;
    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: { ftm: { orderBy: { numero: "desc" }, take: 1 } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const dernierNumero = marche.ftm[0]?.numero || 0;

    const ftm = await prisma.ficheTravauxModificatifs.create({
      data: {
        marcheId: id,
        numero: dernierNumero + 1,
        type: body.type,
        objet: body.objet,
        description: body.description || body.objet, // description est requis
        montantPropose: body.montantEstimeHT,
        statut: "DEMANDE"
      }
    });

    return { item: ftm };
  });

  // ─────────────────────────────────────────────
  // ORDRES DE SERVICE
  // ─────────────────────────────────────────────

  app.get("/marches/:id/os", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const ordres = await prisma.ordreService.findMany({
      where: { marcheId: id },
      orderBy: { dateEffet: "desc" }
    });

    return { items: ordres };
  });

  app.post("/marches/:id/os", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      type: "DEMARRAGE" | "INTERRUPTION" | "REPRISE" | "PROLONGATION" | "RECEPTION";
      objet: string;
      dateEffet: string;
      delaiJours?: number;
    };

    const entrepriseId = req.user.entrepriseId;
    const marche = await prisma.marche.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: { ordresService: { orderBy: { numero: "desc" }, take: 1 } }
    });
    if (!marche) return reply.status(404).send({ error: "Marché non trouvé" });

    const dernierNumero = marche.ordresService[0]?.numero || 0;

    const os = await prisma.ordreService.create({
      data: {
        marcheId: id,
        numero: dernierNumero + 1,
        type: body.type,
        objet: body.objet,
        dateEmission: new Date(),
        dateEffet: new Date(body.dateEffet),
        impactDelai: body.delaiJours || 0
      }
    });

    // Si prolongation, mettre à jour la date de fin prévue
    if (body.type === "PROLONGATION" && body.delaiJours) {
      const nouvelleDateFin = marche.dateFinPrevue 
        ? new Date(marche.dateFinPrevue.getTime() + body.delaiJours * 24 * 60 * 60 * 1000)
        : null;
      
      if (nouvelleDateFin) {
        await prisma.marche.update({
          where: { id },
          data: { dateFinPrevue: nouvelleDateFin }
        });
      }
    }

    return { item: os };
  });
}
