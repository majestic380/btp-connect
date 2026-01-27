// ============================================
// 🚩 BTP CONNECT v9.0 - SERVICE FEATURE FLAGS
// Gestion des fonctionnalités par plateforme
// Date : 17/01/2026
// ============================================

import { prisma } from "../lib/prisma.js";
import type { FeatureCategory, FeaturePlatform, Role } from "@prisma/client";

// Types
export interface FeatureFlagConfig {
  code: string;
  nom: string;
  description?: string;
  category: FeatureCategory;
  platform: FeaturePlatform;
  enabled: boolean;
  enabledDesktop: boolean;
  enabledMobile: boolean;
  enabledWeb: boolean;
  dependsOn?: string[];
  allowedRoles?: Role[];
  config?: Record<string, unknown>;
  version?: string;
  icone?: string;
  ordre?: number;
}

export type PlatformType = "desktop" | "mobile" | "web";

// Features par défaut du système
export const DEFAULT_FEATURES: FeatureFlagConfig[] = [
  // === MODULES PRINCIPAUX ===
  {
    code: "MODULE_DASHBOARD",
    nom: "Tableau de Bord",
    description: "Dashboard principal avec KPIs et statistiques",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "📊",
    ordre: 1,
  },
  {
    code: "MODULE_SOUSTRAITANTS",
    nom: "Gestion Sous-Traitants",
    description: "Annuaire et gestion des sous-traitants",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "👷",
    ordre: 2,
  },
  {
    code: "MODULE_CHANTIERS",
    nom: "Gestion Chantiers",
    description: "Suivi des chantiers et projets",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "🏗️",
    ordre: 3,
  },
  {
    code: "MODULE_MARCHES",
    nom: "Suivi Financier Marchés",
    description: "Gestion des marchés, situations et facturation",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    dependsOn: ["MODULE_CHANTIERS", "MODULE_SOUSTRAITANTS"],
    icone: "💰",
    ordre: 4,
    version: "9.0",
  },
  {
    code: "MODULE_CR",
    nom: "Comptes Rendus Chantier",
    description: "Création et diffusion des comptes rendus de réunion",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    dependsOn: ["MODULE_CHANTIERS"],
    icone: "📝",
    ordre: 5,
    version: "9.0",
  },
  {
    code: "MODULE_VISIONNEUSE",
    nom: "Visionneuse Plans & BIM",
    description: "Visualisation de plans PDF et maquettes IFC/BIM",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: false, // Désactivé par défaut sur mobile
    enabledWeb: true,
    dependsOn: ["MODULE_CHANTIERS"],
    icone: "🗺️",
    ordre: 6,
    version: "9.0",
  },
  {
    code: "MODULE_APPELS_OFFRES",
    nom: "Appels d'Offres",
    description: "Gestion des consultations et comparatifs d'offres",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    dependsOn: ["MODULE_CHANTIERS", "MODULE_SOUSTRAITANTS"],
    icone: "📨",
    ordre: 7,
    version: "9.0",
  },
  {
    code: "MODULE_GED",
    nom: "Gestion Documentaire",
    description: "GED avec codification et workflow de visa",
    category: "MODULE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    dependsOn: ["MODULE_CHANTIERS"],
    icone: "📁",
    ordre: 8,
  },
  {
    code: "MODULE_ADMIN",
    nom: "Administration",
    description: "Paramètres, utilisateurs, imports/exports",
    category: "ADMIN",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: false,
    enabledWeb: true,
    allowedRoles: ["ADMIN"],
    icone: "⚙️",
    ordre: 99,
  },

  // === FONCTIONNALITÉS SPÉCIFIQUES ===
  {
    code: "FEATURE_DPGF_IMPORT",
    nom: "Import DPGF Excel",
    description: "Importer des DPGF depuis des fichiers Excel",
    category: "FEATURE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: false,
    enabledWeb: true,
    dependsOn: ["MODULE_MARCHES"],
    icone: "📥",
    ordre: 10,
    version: "9.0",
  },
  {
    code: "FEATURE_PDF_EXPORT",
    nom: "Export PDF",
    description: "Générer des documents PDF (situations, CR)",
    category: "FEATURE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "📄",
    ordre: 11,
    version: "9.0",
  },
  {
    code: "FEATURE_EMAIL_ENVOI",
    nom: "Envoi Email",
    description: "Envoyer des documents par email",
    category: "FEATURE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "✉️",
    ordre: 12,
    version: "9.0",
  },
  {
    code: "FEATURE_CHORUS_PRO",
    nom: "Intégration Chorus Pro",
    description: "Dépôt automatique des factures sur Chorus Pro",
    category: "FEATURE",
    platform: "DESKTOP",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: false,
    enabledWeb: false,
    dependsOn: ["MODULE_MARCHES"],
    icone: "🏛️",
    ordre: 13,
  },
  {
    code: "FEATURE_SIRENE_API",
    nom: "Recherche SIRENE",
    description: "Recherche d'entreprises via l'API SIRENE",
    category: "FEATURE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    dependsOn: ["MODULE_SOUSTRAITANTS"],
    icone: "🔍",
    ordre: 14,
  },
  {
    code: "FEATURE_BCF_EXPORT",
    nom: "Export BCF",
    description: "Exporter les annotations au format BCF",
    category: "FEATURE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: false,
    enabledWeb: true,
    dependsOn: ["MODULE_VISIONNEUSE"],
    icone: "📦",
    ordre: 15,
    version: "9.0",
  },
  {
    code: "FEATURE_COMPARATIF_OFFRES",
    nom: "Comparatif Offres",
    description: "Analyse comparative des offres reçues",
    category: "FEATURE",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    dependsOn: ["MODULE_APPELS_OFFRES"],
    icone: "📊",
    ordre: 16,
    version: "9.0",
  },

  // === UI / INTERFACE ===
  {
    code: "UI_DARK_MODE",
    nom: "Mode Sombre",
    description: "Interface en mode sombre",
    category: "UI",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "🌙",
    ordre: 20,
  },
  {
    code: "UI_NOTIFICATIONS",
    nom: "Notifications",
    description: "Centre de notifications in-app",
    category: "UI",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "🔔",
    ordre: 21,
  },
  {
    code: "UI_QUICK_ACTIONS",
    nom: "Actions Rapides",
    description: "Barre d'actions rapides sur le dashboard",
    category: "UI",
    platform: "ALL",
    enabled: true,
    enabledDesktop: true,
    enabledMobile: true,
    enabledWeb: true,
    icone: "⚡",
    ordre: 22,
  },

  // === BETA ===
  {
    code: "BETA_AI_ASSISTANT",
    nom: "Assistant IA (Beta)",
    description: "Assistant IA pour l'analyse de documents et recommandations",
    category: "BETA",
    platform: "ALL",
    enabled: false,
    enabledDesktop: false,
    enabledMobile: false,
    enabledWeb: false,
    icone: "🤖",
    ordre: 50,
  },
  {
    code: "BETA_MOBILE_OFFLINE",
    nom: "Mode Hors-Ligne Mobile (Beta)",
    description: "Synchronisation offline pour l'application mobile",
    category: "BETA",
    platform: "MOBILE",
    enabled: false,
    enabledDesktop: false,
    enabledMobile: false,
    enabledWeb: false,
    icone: "📴",
    ordre: 51,
  },
];

// ============================================
// FONCTIONS DU SERVICE
// ============================================

/**
 * Initialise les feature flags par défaut pour une entreprise
 */
export async function initializeDefaultFlags(entrepriseId: string): Promise<number> {
  let created = 0;

  for (const feature of DEFAULT_FEATURES) {
    const existing = await prisma.featureFlag.findUnique({
      where: { entrepriseId_code: { entrepriseId, code: feature.code } },
    });

    if (!existing) {
      await prisma.featureFlag.create({
        data: {
          entrepriseId,
          code: feature.code,
          nom: feature.nom,
          description: feature.description,
          category: feature.category,
          platform: feature.platform,
          enabled: feature.enabled,
          enabledDesktop: feature.enabledDesktop,
          enabledMobile: feature.enabledMobile,
          enabledWeb: feature.enabledWeb,
          dependsOn: JSON.stringify(feature.dependsOn || []),
          allowedRoles: JSON.stringify(feature.allowedRoles || []),
          config: JSON.stringify(feature.config || {}),
          version: feature.version,
          icone: feature.icone,
          ordre: feature.ordre || 0,
        },
      });
      created++;
    }
  }

  return created;
}

/**
 * Récupère tous les feature flags d'une entreprise
 */
export async function getFeatureFlags(entrepriseId: string) {
  // S'assurer que les flags par défaut existent
  await initializeDefaultFlags(entrepriseId);

  return prisma.featureFlag.findMany({
    where: { entrepriseId },
    orderBy: [{ category: "asc" }, { ordre: "asc" }],
  });
}

/**
 * Récupère les feature flags groupés par catégorie
 */
export async function getFeatureFlagsByCategory(entrepriseId: string) {
  const flags = await getFeatureFlags(entrepriseId);

  const grouped: Record<string, typeof flags> = {};
  for (const flag of flags) {
    const cat = flag.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(flag);
  }

  return grouped;
}

/**
 * Vérifie si une feature est activée pour une plateforme donnée
 */
export async function isFeatureEnabled(
  entrepriseId: string,
  code: string,
  platform: PlatformType,
  userRole?: Role
): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: { entrepriseId_code: { entrepriseId, code } },
  });

  if (!flag) {
    // Chercher dans les defaults
    const defaultFlag = DEFAULT_FEATURES.find((f) => f.code === code);
    if (!defaultFlag) return false;

    // Créer le flag manquant
    await initializeDefaultFlags(entrepriseId);
    return isFeatureEnabled(entrepriseId, code, platform, userRole);
  }

  // Vérifier si globalement activé
  if (!flag.enabled) return false;

  // Vérifier si deprecated
  if (flag.deprecated) return false;

  // Vérifier par plateforme
  const platformEnabled = {
    desktop: flag.enabledDesktop,
    mobile: flag.enabledMobile,
    web: flag.enabledWeb,
  }[platform];

  if (!platformEnabled) return false;

  // Vérifier les rôles autorisés
  if (flag.allowedRoles && flag.allowedRoles.length > 0 && userRole) {
    if (!flag.allowedRoles.includes(userRole)) return false;
  }

  // Vérifier les dépendances
  if (flag.dependsOn && flag.dependsOn.length > 0) {
    for (const depCode of flag.dependsOn) {
      const depEnabled = await isFeatureEnabled(entrepriseId, depCode, platform, userRole);
      if (!depEnabled) return false;
    }
  }

  return true;
}

/**
 * Met à jour un feature flag
 */
export async function updateFeatureFlag(
  entrepriseId: string,
  code: string,
  updates: Partial<{
    enabled: boolean;
    enabledDesktop: boolean;
    enabledMobile: boolean;
    enabledWeb: boolean;
    config: Record<string, unknown>;
  }>
) {
  return prisma.featureFlag.update({
    where: { entrepriseId_code: { entrepriseId, code } },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });
}

/**
 * Active/désactive une feature en masse pour une plateforme
 */
export async function toggleFeaturesByPlatform(
  entrepriseId: string,
  platform: PlatformType,
  enabled: boolean,
  category?: FeatureCategory
) {
  const where: Record<string, unknown> = { entrepriseId };
  if (category) where.category = category;

  const field = {
    desktop: "enabledDesktop",
    mobile: "enabledMobile",
    web: "enabledWeb",
  }[platform];

  return prisma.featureFlag.updateMany({
    where,
    data: { [field]: enabled, updatedAt: new Date() },
  });
}

/**
 * Récupère la configuration client des feature flags
 * (version simplifiée pour le frontend)
 */
export async function getClientFeatureConfig(
  entrepriseId: string,
  platform: PlatformType,
  userRole?: Role
) {
  const flags = await getFeatureFlags(entrepriseId);
  const config: Record<string, boolean> = {};

  for (const flag of flags) {
    config[flag.code] = await isFeatureEnabled(entrepriseId, flag.code, platform, userRole);
  }

  return config;
}

/**
 * Récupère les features activées avec leurs métadonnées
 */
export async function getEnabledFeatures(
  entrepriseId: string,
  platform: PlatformType,
  userRole?: Role
) {
  const flags = await getFeatureFlags(entrepriseId);
  const enabled: Array<{
    code: string;
    nom: string;
    icone?: string | null;
    category: FeatureCategory;
  }> = [];

  for (const flag of flags) {
    const isEnabled = await isFeatureEnabled(entrepriseId, flag.code, platform, userRole);
    if (isEnabled) {
      enabled.push({
        code: flag.code,
        nom: flag.nom,
        icone: flag.icone,
        category: flag.category,
      });
    }
  }

  return enabled;
}

/**
 * Réinitialise les flags aux valeurs par défaut
 */
export async function resetToDefaults(entrepriseId: string) {
  // Supprimer les flags existants
  await prisma.featureFlag.deleteMany({ where: { entrepriseId } });

  // Réinitialiser
  return initializeDefaultFlags(entrepriseId);
}

export default {
  DEFAULT_FEATURES,
  initializeDefaultFlags,
  getFeatureFlags,
  getFeatureFlagsByCategory,
  isFeatureEnabled,
  updateFeatureFlag,
  toggleFeaturesByPlatform,
  getClientFeatureConfig,
  getEnabledFeatures,
  resetToDefaults,
};
