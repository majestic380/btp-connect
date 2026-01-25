// ============================================
// 🏗️ BTP CONNECT v9.0 - ROUTES APPELS D'OFFRES
// Consultations & Comparatifs
// ============================================

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../guards/role.js";
import { sendConsultationEmail, sendRelanceEmail } from "../services/email.js";

// Schémas de validation
const createConsultationSchema = z.object({
  chantierId: z.string().uuid(),
  objet: z.string().min(1),
  lot: z.string().optional(),
  description: z.string().optional(),
  dateLimite: z.string().datetime(),
  dateOuverture: z.string().datetime().optional(),
  typePrix: z.enum(["FERME", "REVISABLE", "QUANTITATIF"]).default("FERME"),
  critPrix: z.number().min(0).max(100).default(60),
  critDelai: z.number().min(0).max(100).default(20),
  critTechnique: z.number().min(0).max(100).default(20),
});

const updateConsultationSchema = createConsultationSchema.partial();

const offreSchema = z.object({
  montantHT: z.number().positive(),
  montantTTC: z.number().positive().optional(),
  delaiExecution: z.number().int().positive().optional(),
  validiteOffre: z.number().int().positive().optional(),
  observations: z.string().optional(),
  variantes: z.string().optional(),
});

export async function appelOffresRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────
  // CONSULTATIONS - CRUD
  // ─────────────────────────────────────────────

  // Liste des consultations
  app.get("/consultations", { preHandler: [app.authenticate] }, async (req) => {
    const entrepriseId = req.user.entrepriseId;
    const query = req.query as { chantierId?: string; statut?: string };

    const where: any = {
      chantier: { entrepriseId }
    };
    if (query.chantierId) where.chantierId = query.chantierId;
    if (query.statut) where.statut = query.statut;

    const consultations = await prisma.consultation.findMany({
      where,
      include: {
        chantier: { select: { id: true, nom: true, reference: true } },
        entreprisesConsultees: {
          include: {
            sousTraitant: { select: { id: true, nom: true } },
            offre: true
          }
        },
        _count: { select: { documents: true } }
      },
      orderBy: { dateLimite: "asc" }
    });

    // Enrichir avec statistiques
    const items = consultations.map(c => {
      const nbEnvoyes = c.entreprisesConsultees.filter(e => e.statut !== "NON_ENVOYE").length;
      const nbLus = c.entreprisesConsultees.filter(e => ["LU", "REPONDU"].includes(e.statut)).length;
      const nbRepondus = c.entreprisesConsultees.filter(e => e.statut === "REPONDU").length;
      const joursRestants = Math.ceil((new Date(c.dateLimite).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      return {
        ...c,
        stats: { nbEnvoyes, nbLus, nbRepondus, joursRestants }
      };
    });

    return { items };
  });

  // Détail d'une consultation
  app.get("/consultations/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        chantier: true,
        documents: { orderBy: { createdAt: "desc" } },
        entreprisesConsultees: {
          include: {
            sousTraitant: true,
            offre: true
          },
          orderBy: { sousTraitant: { nom: "asc" } }
        }
      }
    });

    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });
    return { item: consultation };
  });

  // Créer une consultation
  app.post("/consultations", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const parsed = createConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const data = parsed.data;

    // Vérifier critères = 100%
    if (data.critPrix + data.critDelai + data.critTechnique !== 100) {
      return reply.status(400).send({ error: "La somme des critères doit être égale à 100%" });
    }

    // Vérifier que le chantier appartient à l'entreprise
    const chantier = await prisma.chantier.findFirst({
      where: { id: data.chantierId, entrepriseId }
    });
    if (!chantier) return reply.status(400).send({ error: "Chantier invalide" });

    // Générer référence unique
    const annee = new Date().getFullYear();
    const count = await prisma.consultation.count({
      where: { reference: { startsWith: `AO-${annee}` } }
    });
    const reference = `AO-${annee}-${String(count + 1).padStart(3, '0')}`;

    const consultation = await prisma.consultation.create({
      data: {
        chantierId: data.chantierId,
        reference,
        objet: data.objet,
        lot: data.lot,
        description: data.description,
        dateLimite: new Date(data.dateLimite),
        dateOuverture: data.dateOuverture ? new Date(data.dateOuverture) : null,
        typePrix: data.typePrix,
        critPrix: data.critPrix,
        critDelai: data.critDelai,
        critTechnique: data.critTechnique,
        statut: "BROUILLON"
      }
    });

    return { item: consultation };
  });

  // Mettre à jour une consultation
  app.patch("/consultations/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const entrepriseId = req.user.entrepriseId;
    const existing = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Consultation non trouvée" });

    if (existing.statut !== "BROUILLON") {
      return reply.status(400).send({ error: "Consultation déjà envoyée, non modifiable" });
    }

    const data: any = { ...parsed.data };
    if (data.dateLimite) data.dateLimite = new Date(data.dateLimite);
    if (data.dateOuverture) data.dateOuverture = new Date(data.dateOuverture);

    const consultation = await prisma.consultation.update({
      where: { id },
      data
    });

    return { item: consultation };
  });

  // Supprimer une consultation
  app.delete("/consultations/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const existing = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!existing) return reply.status(404).send({ error: "Consultation non trouvée" });

    await prisma.consultation.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // ENTREPRISES CONSULTÉES
  // ─────────────────────────────────────────────

  // Ajouter des entreprises à une consultation
  app.post("/consultations/:id/entreprises", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { sousTraitantIds: string[] };

    const entrepriseId = req.user.entrepriseId;
    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    // Vérifier que les ST appartiennent à l'entreprise
    const sts = await prisma.sousTraitant.findMany({
      where: { id: { in: body.sousTraitantIds }, entrepriseId }
    });

    const created = [];
    for (const st of sts) {
      // Vérifier si déjà ajouté
      const existing = await prisma.consultationEntreprise.findUnique({
        where: { consultationId_sousTraitantId: { consultationId: id, sousTraitantId: st.id } }
      });
      if (existing) continue;

      const ce = await prisma.consultationEntreprise.create({
        data: {
          consultationId: id,
          sousTraitantId: st.id,
          statut: "NON_ENVOYE"
        }
      });
      created.push(ce);
    }

    return { items: created, added: created.length };
  });

  // Retirer une entreprise d'une consultation
  app.delete("/consultations/:consultationId/entreprises/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { consultationId, id } = req.params as { consultationId: string; id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id: consultationId, chantier: { entrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    if (consultation.statut !== "BROUILLON") {
      return reply.status(400).send({ error: "Impossible de retirer une entreprise après envoi" });
    }

    await prisma.consultationEntreprise.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // DOCUMENTS DE CONSULTATION
  // ─────────────────────────────────────────────

  app.post("/consultations/:id/documents", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      nom: string;
      type: string; // CCTP, DPGF, PLAN, RC, ACTE_ENGAGEMENT, AUTRE
      description?: string;
      fichierUrl: string;
      tailleFichier: number;
      obligatoire?: boolean;
    };

    const entrepriseId = req.user.entrepriseId;
    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    const document = await prisma.documentConsultation.create({
      data: {
        consultationId: id,
        nom: body.nom,
        type: body.type,
        description: body.description,
        fichierUrl: body.fichierUrl,
        tailleFichier: body.tailleFichier,
        obligatoire: body.obligatoire || false
      }
    });

    return { item: document };
  });

  app.delete("/consultations/:consultationId/documents/:id", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { consultationId, id } = req.params as { consultationId: string; id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id: consultationId, chantier: { entrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    await prisma.documentConsultation.delete({ where: { id } });
    return { success: true };
  });

  // ─────────────────────────────────────────────
  // ENVOI DE LA CONSULTATION
  // ─────────────────────────────────────────────

  app.post("/consultations/:id/envoyer", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        entreprisesConsultees: { include: { sousTraitant: true } },
        documents: true
      }
    });

    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });
    if (consultation.statut !== "BROUILLON") {
      return reply.status(400).send({ error: "Consultation déjà envoyée" });
    }
    if (consultation.entreprisesConsultees.length === 0) {
      return reply.status(400).send({ error: "Aucune entreprise sélectionnée" });
    }

    // Mettre à jour les statuts
    const now = new Date();
    await prisma.consultationEntreprise.updateMany({
      where: { consultationId: id, statut: "NON_ENVOYE" },
      data: { statut: "ENVOYE", dateEnvoi: now }
    });

    await prisma.consultation.update({
      where: { id },
      data: { statut: "EN_COURS" }
    });

    // Récupérer info entreprise émettrice
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { entreprise: true }
    });

    // Récupérer chantier pour le nom
    const chantier = await prisma.chantier.findUnique({
      where: { id: consultation.chantierId }
    });

    // Envoyer les emails
    const resultatsEnvoi: Array<{ nom: string; email: string; success: boolean; error?: string }> = [];

    for (const ce of consultation.entreprisesConsultees) {
      if (!ce.sousTraitant.email) {
        resultatsEnvoi.push({ 
          nom: ce.sousTraitant.nom, 
          email: '', 
          success: false, 
          error: 'Email manquant' 
        });
        continue;
      }

      const result = await sendConsultationEmail({
        destinataire: ce.sousTraitant.email,
        entrepriseNom: ce.sousTraitant.nom,
        consultationRef: consultation.reference,
        objet: consultation.objet,
        dateLimite: consultation.dateLimite,
        chantierNom: chantier?.nom || 'Chantier',
        entrepriseEmettrice: user?.entreprise?.nom
      });

      resultatsEnvoi.push({
        nom: ce.sousTraitant.nom,
        email: ce.sousTraitant.email,
        success: result.success,
        error: result.error
      });
    }

    const nbEnvoyes = resultatsEnvoi.filter(r => r.success).length;
    const nbEchecs = resultatsEnvoi.filter(r => !r.success).length;

    return { 
      success: nbEnvoyes > 0, 
      envoyesA: resultatsEnvoi,
      stats: { envoyes: nbEnvoyes, echecs: nbEchecs },
      message: `Consultation envoyée à ${nbEnvoyes} entreprise(s)${nbEchecs > 0 ? `, ${nbEchecs} échec(s)` : ''}`
    };
  });

  // Relancer les non-répondants
  app.post("/consultations/:id/relancer", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        entreprisesConsultees: {
          where: { statut: { in: ["ENVOYE", "LU"] } },
          include: { sousTraitant: true }
        }
      }
    });

    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });
    if (!["EN_COURS", "ENVOYEE"].includes(consultation.statut)) {
      return reply.status(400).send({ error: "Consultation non en cours" });
    }

    if (consultation.entreprisesConsultees.length === 0) {
      return reply.status(400).send({ error: "Aucune entreprise à relancer" });
    }

    // Envoyer les emails de relance
    const resultatsRelance: Array<{ nom: string; success: boolean }> = [];

    for (const ce of consultation.entreprisesConsultees) {
      if (!ce.sousTraitant.email) {
        resultatsRelance.push({ nom: ce.sousTraitant.nom, success: false });
        continue;
      }

      const result = await sendRelanceEmail({
        destinataire: ce.sousTraitant.email,
        entrepriseNom: ce.sousTraitant.nom,
        consultationRef: consultation.reference,
        objet: consultation.objet,
        dateLimite: consultation.dateLimite,
        nbRelances: (ce.nbRelances || 0) + 1
      });

      resultatsRelance.push({
        nom: ce.sousTraitant.nom,
        success: result.success
      });

      // Mettre à jour le compteur de relances
      if (result.success) {
        await prisma.consultationEntreprise.update({
          where: { id: ce.id },
          data: { 
            nbRelances: { increment: 1 },
            derniereRelance: new Date()
          }
        });
      }
    }

    const nbRelances = resultatsRelance.filter(r => r.success).length;

    return { 
      success: nbRelances > 0, 
      relances: nbRelances,
      details: resultatsRelance,
      message: `${nbRelances} relance(s) envoyée(s)`
    };
  });

  // ─────────────────────────────────────────────
  // ENREGISTREMENT DES OFFRES
  // ─────────────────────────────────────────────

  app.post("/consultations/:consultationId/offres/:entrepriseId", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR", "COMPTABLE"])] 
  }, async (req, reply) => {
    const { consultationId, entrepriseId: ceId } = req.params as { consultationId: string; entrepriseId: string };
    const parsed = offreSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const userEntrepriseId = req.user.entrepriseId;
    const consultation = await prisma.consultation.findFirst({
      where: { id: consultationId, chantier: { entrepriseId: userEntrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    // Trouver l'entreprise consultée
    const ce = await prisma.consultationEntreprise.findFirst({
      where: { id: ceId, consultationId }
    });
    if (!ce) return reply.status(404).send({ error: "Entreprise non trouvée dans cette consultation" });

    // Créer ou mettre à jour l'offre
    const existingOffre = await prisma.offreAO.findUnique({
      where: { consultationEntrepriseId: ce.id }
    });

    let offre;
    if (existingOffre) {
      offre = await prisma.offreAO.update({
        where: { id: existingOffre.id },
        data: parsed.data
      });
    } else {
      offre = await prisma.offreAO.create({
        data: {
          consultationEntrepriseId: ce.id,
          ...parsed.data
        }
      });
    }

    // Mettre à jour le statut
    await prisma.consultationEntreprise.update({
      where: { id: ce.id },
      data: { statut: "REPONDU", dateReponse: new Date() }
    });

    return { item: offre };
  });

  // ─────────────────────────────────────────────
  // COMPARATIF & ANALYSE
  // ─────────────────────────────────────────────

  app.get("/consultations/:id/comparatif", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        entreprisesConsultees: {
          where: { statut: "REPONDU" },
          include: {
            sousTraitant: true,
            offre: true
          }
        }
      }
    });

    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    const offres = consultation.entreprisesConsultees
      .filter(e => e.offre)
      .map(e => ({
        entrepriseId: e.id,
        sousTraitant: e.sousTraitant,
        offre: e.offre!
      }));

    if (offres.length < 2) {
      return reply.status(400).send({ error: "Au moins 2 offres requises pour le comparatif" });
    }

    // Calcul des notes pondérées
    const montants = offres.map(o => Number(o.offre.montantHT));
    const delais = offres.map(o => o.offre.delaiExecution || 0);
    const minMontant = Math.min(...montants);
    const maxMontant = Math.max(...montants);
    const minDelai = Math.min(...delais.filter(d => d > 0)) || 1;
    const maxDelai = Math.max(...delais) || 1;

    const comparatif = offres.map(o => {
      const montant = Number(o.offre.montantHT);
      const delai = o.offre.delaiExecution || 0;

      // Note prix (100 = moins cher, 0 = plus cher)
      const notePrix = maxMontant === minMontant 
        ? 100 
        : Math.round(((maxMontant - montant) / (maxMontant - minMontant)) * 100);

      // Note délai (100 = plus court, 0 = plus long)
      const noteDelai = maxDelai === minDelai || delai === 0
        ? 50 
        : Math.round(((maxDelai - delai) / (maxDelai - minDelai)) * 100);

      // Note technique (par défaut 50, à remplir manuellement)
      const noteTechnique = o.offre.noteTechnique || 50;

      // Note globale pondérée
      const noteGlobale = Math.round(
        (notePrix * consultation.critPrix / 100) +
        (noteDelai * consultation.critDelai / 100) +
        (noteTechnique * consultation.critTechnique / 100)
      );

      return {
        entreprise: o.sousTraitant,
        offre: o.offre,
        notes: { notePrix, noteDelai, noteTechnique, noteGlobale },
        ecartMoinsDisant: montant - minMontant,
        ecartPourcentage: minMontant > 0 ? ((montant - minMontant) / minMontant) * 100 : 0
      };
    });

    // Trier par note globale décroissante
    comparatif.sort((a, b) => b.notes.noteGlobale - a.notes.noteGlobale);

    // Identifier le recommandé (meilleure note globale)
    const recommande = comparatif[0];
    const moinsDisant = comparatif.reduce((min, c) => 
      Number(c.offre.montantHT) < Number(min.offre.montantHT) ? c : min
    );

    return {
      consultation: {
        id: consultation.id,
        reference: consultation.reference,
        objet: consultation.objet,
        criteres: {
          prix: consultation.critPrix,
          delai: consultation.critDelai,
          technique: consultation.critTechnique
        }
      },
      comparatif,
      recommandation: {
        mieuxDisant: recommande.entreprise,
        moinsDisant: moinsDisant.entreprise,
        noteMax: recommande.notes.noteGlobale
      }
    };
  });

  // ─────────────────────────────────────────────
  // CLÔTURE & ATTRIBUTION
  // ─────────────────────────────────────────────

  app.post("/consultations/:id/cloturer", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const entrepriseId = req.user.entrepriseId;

    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    await prisma.consultation.update({
      where: { id },
      data: { statut: "CLOTUREE" }
    });

    return { success: true };
  });

  app.post("/consultations/:id/attribuer", { 
    preHandler: [app.authenticate, requireRole(["ADMIN", "CONDUCTEUR"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { 
      consultationEntrepriseId: string;
      motif?: string;
    };

    const entrepriseId = req.user.entrepriseId;
    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } },
      include: {
        entreprisesConsultees: {
          where: { id: body.consultationEntrepriseId },
          include: { sousTraitant: true }
        }
      }
    });

    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });
    if (consultation.entreprisesConsultees.length === 0) {
      return reply.status(400).send({ error: "Entreprise non trouvée" });
    }

    const attributaire = consultation.entreprisesConsultees[0];

    await prisma.consultation.update({
      where: { id },
      data: { 
        statut: "ATTRIBUEE",
        attributaireId: attributaire.sousTraitantId,
        dateAttribution: new Date(),
        motifAttribution: body.motif
      }
    });

    return { 
      success: true, 
      attributaireNom: attributaire.sousTraitant.nom,
      message: `Consultation attribuée à ${attributaire.sousTraitant.nom}`
    };
  });

  // Annuler une consultation
  app.post("/consultations/:id/annuler", { 
    preHandler: [app.authenticate, requireRole(["ADMIN"])] 
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { motif: string };

    const entrepriseId = req.user.entrepriseId;
    const consultation = await prisma.consultation.findFirst({
      where: { id, chantier: { entrepriseId } }
    });
    if (!consultation) return reply.status(404).send({ error: "Consultation non trouvée" });

    await prisma.consultation.update({
      where: { id },
      data: { 
        statut: "ANNULEE",
        motifAttribution: body.motif // Réutiliser le champ pour le motif d'annulation
      }
    });

    return { success: true };
  });
}
