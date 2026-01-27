// ============================================
// 🚩 BTP CONNECT v9.0 - ROUTES FEATURE FLAGS
// API de gestion des fonctionnalités
// Date : 17/01/2026
// ============================================

import type { FastifyInstance } from "fastify";
import { requireRole } from "../guards/role.js";
import {
  getFeatureFlags,
  getFeatureFlagsByCategory,
  isFeatureEnabled,
  updateFeatureFlag,
  toggleFeaturesByPlatform,
  getClientFeatureConfig,
  getEnabledFeatures,
  resetToDefaults,
  DEFAULT_FEATURES,
  type PlatformType,
} from "../services/feature-flags.js";
import type { FeatureCategory } from "@prisma/client";

export async function featureFlagsRoutes(app: FastifyInstance) {
  // ============================================
  // ROUTES PUBLIQUES (authentifiées)
  // ============================================

  /**
   * GET /features/config
   * Récupère la configuration des features pour le client courant
   * Query: platform (desktop|mobile|web)
   */
  app.get(
    "/features/config",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const platform = (req.query as { platform?: string }).platform || detectPlatform(req);
      const userRole = req.user.role;

      const config = await getClientFeatureConfig(
        entrepriseId,
        platform as PlatformType,
        userRole
      );

      return {
        platform,
        role: userRole,
        features: config,
      };
    }
  );

  /**
   * GET /features/enabled
   * Récupère la liste des features activées avec métadonnées
   * Query: platform (desktop|mobile|web)
   */
  app.get(
    "/features/enabled",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const platform = (req.query as { platform?: string }).platform || detectPlatform(req);
      const userRole = req.user.role;

      const features = await getEnabledFeatures(
        entrepriseId,
        platform as PlatformType,
        userRole
      );

      return {
        platform,
        count: features.length,
        features,
      };
    }
  );

  /**
   * GET /features/check/:code
   * Vérifie si une feature spécifique est activée
   * Query: platform (desktop|mobile|web)
   */
  app.get(
    "/features/check/:code",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const { code } = req.params as { code: string };
      const platform = (req.query as { platform?: string }).platform || detectPlatform(req);
      const userRole = req.user.role;

      const enabled = await isFeatureEnabled(
        entrepriseId,
        code,
        platform as PlatformType,
        userRole
      );

      return {
        code,
        platform,
        enabled,
      };
    }
  );

  // ============================================
  // ROUTES ADMIN
  // ============================================

  /**
   * GET /admin/features
   * Liste tous les feature flags de l'entreprise
   */
  app.get(
    "/admin/features",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const flags = await getFeatureFlags(entrepriseId);

      return {
        count: flags.length,
        items: flags,
      };
    }
  );

  /**
   * GET /admin/features/by-category
   * Liste les feature flags groupés par catégorie
   */
  app.get(
    "/admin/features/by-category",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const grouped = await getFeatureFlagsByCategory(entrepriseId);

      return {
        categories: Object.keys(grouped),
        data: grouped,
      };
    }
  );

  /**
   * GET /admin/features/defaults
   * Liste les features par défaut du système
   */
  app.get(
    "/admin/features/defaults",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (_req, reply) => {
      return {
        count: DEFAULT_FEATURES.length,
        items: DEFAULT_FEATURES,
      };
    }
  );

  /**
   * PATCH /admin/features/:code
   * Met à jour un feature flag
   */
  app.patch(
    "/admin/features/:code",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const { code } = req.params as { code: string };
      const body = req.body as {
        enabled?: boolean;
        enabledDesktop?: boolean;
        enabledMobile?: boolean;
        enabledWeb?: boolean;
        config?: Record<string, unknown>;
      };

      try {
        const updated = await updateFeatureFlag(entrepriseId, code, body);
        return {
          success: true,
          item: updated,
        };
      } catch (error) {
        return reply.status(404).send({
          error: "Feature not found",
          code,
        });
      }
    }
  );

  /**
   * POST /admin/features/:code/toggle
   * Active/désactive une feature (toggle global)
   */
  app.post(
    "/admin/features/:code/toggle",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const { code } = req.params as { code: string };
      const { enabled } = req.body as { enabled?: boolean };

      try {
        // Si enabled n'est pas fourni, on toggle
        const currentFlags = await getFeatureFlags(entrepriseId);
        const current = currentFlags.find((f) => f.code === code);

        if (!current) {
          return reply.status(404).send({ error: "Feature not found", code });
        }

        const newValue = enabled !== undefined ? enabled : !current.enabled;

        const updated = await updateFeatureFlag(entrepriseId, code, {
          enabled: newValue,
        });

        return {
          success: true,
          code,
          enabled: updated.enabled,
        };
      } catch (error) {
        return reply.status(500).send({ error: "Update failed" });
      }
    }
  );

  /**
   * POST /admin/features/platform/:platform/toggle
   * Active/désactive toutes les features d'une plateforme
   */
  app.post(
    "/admin/features/platform/:platform/toggle",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const { platform } = req.params as { platform: string };
      const { enabled, category } = req.body as {
        enabled: boolean;
        category?: FeatureCategory;
      };

      if (!["desktop", "mobile", "web"].includes(platform)) {
        return reply.status(400).send({
          error: "Invalid platform",
          valid: ["desktop", "mobile", "web"],
        });
      }

      const result = await toggleFeaturesByPlatform(
        entrepriseId,
        platform as PlatformType,
        enabled,
        category
      );

      return {
        success: true,
        platform,
        enabled,
        category: category || "all",
        updated: result.count,
      };
    }
  );

  /**
   * POST /admin/features/reset
   * Réinitialise tous les flags aux valeurs par défaut
   */
  app.post(
    "/admin/features/reset",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const { confirm } = req.body as { confirm?: boolean };

      if (!confirm) {
        return reply.status(400).send({
          error: "Confirmation required",
          message: "Envoyez { confirm: true } pour confirmer la réinitialisation",
        });
      }

      const created = await resetToDefaults(entrepriseId);

      return {
        success: true,
        message: "Features réinitialisées aux valeurs par défaut",
        created,
      };
    }
  );

  /**
   * GET /admin/features/matrix
   * Matrice complète des features par plateforme
   */
  app.get(
    "/admin/features/matrix",
    { preHandler: [app.authenticate, requireRole(["ADMIN"])] },
    async (req, reply) => {
      const entrepriseId = req.user.entrepriseId;
      const flags = await getFeatureFlags(entrepriseId);

      const matrix = flags.map((f) => ({
        code: f.code,
        nom: f.nom,
        category: f.category,
        icone: f.icone,
        global: f.enabled,
        desktop: f.enabled && f.enabledDesktop,
        mobile: f.enabled && f.enabledMobile,
        web: f.enabled && f.enabledWeb,
        deprecated: f.deprecated,
        dependsOn: f.dependsOn,
      }));

      // Stats
      const stats = {
        total: flags.length,
        enabled: flags.filter((f) => f.enabled).length,
        desktop: flags.filter((f) => f.enabled && f.enabledDesktop).length,
        mobile: flags.filter((f) => f.enabled && f.enabledMobile).length,
        web: flags.filter((f) => f.enabled && f.enabledWeb).length,
        byCategory: {} as Record<string, number>,
      };

      for (const f of flags) {
        stats.byCategory[f.category] = (stats.byCategory[f.category] || 0) + 1;
      }

      return {
        matrix,
        stats,
      };
    }
  );
}

// ============================================
// HELPERS
// ============================================

function detectPlatform(req: { headers: Record<string, string | string[] | undefined> }): PlatformType {
  const userAgent = (req.headers["user-agent"] || "").toString().toLowerCase();

  // Electron
  if (userAgent.includes("electron")) {
    return "desktop";
  }

  // Mobile
  if (
    userAgent.includes("mobile") ||
    userAgent.includes("android") ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipad")
  ) {
    return "mobile";
  }

  // Par défaut: web
  return "web";
}

export default featureFlagsRoutes;
