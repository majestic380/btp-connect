// ============================================
// 🚩 BTP CONNECT v9.0 - MIDDLEWARE FEATURE FLAGS
// Garde pour vérifier l'activation des features
// Date : 17/01/2026
// ============================================

import type { FastifyRequest, FastifyReply } from "fastify";
import { isFeatureEnabled, type PlatformType } from "../services/feature-flags.js";

/**
 * Crée un guard qui vérifie si une feature est activée
 * Usage dans les routes:
 * 
 * app.get('/marches', { 
 *   preHandler: [app.authenticate, requireFeature('MODULE_MARCHES')] 
 * }, async (req, reply) => { ... })
 */
export function requireFeature(featureCode: string) {
  return async function featureGuard(
    req: FastifyRequest,
    reply: FastifyReply
  ) {
    // L'utilisateur doit être authentifié
    if (!req.user) {
      return reply.status(401).send({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }

    const entrepriseId = req.user.entrepriseId;
    const platform = detectPlatform(req);
    const userRole = req.user.role;

    const enabled = await isFeatureEnabled(
      entrepriseId,
      featureCode,
      platform,
      userRole
    );

    if (!enabled) {
      return reply.status(403).send({
        error: "Feature disabled",
        code: "FEATURE_DISABLED",
        feature: featureCode,
        platform,
        message: `La fonctionnalité "${featureCode}" n'est pas activée pour votre plateforme (${platform}) ou votre rôle.`,
      });
    }

    // Feature activée, continuer
  };
}

/**
 * Crée un guard qui vérifie plusieurs features (toutes doivent être activées)
 */
export function requireFeatures(featureCodes: string[]) {
  return async function featuresGuard(
    req: FastifyRequest,
    reply: FastifyReply
  ) {
    if (!req.user) {
      return reply.status(401).send({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }

    const entrepriseId = req.user.entrepriseId;
    const platform = detectPlatform(req);
    const userRole = req.user.role;

    const disabledFeatures: string[] = [];

    for (const code of featureCodes) {
      const enabled = await isFeatureEnabled(entrepriseId, code, platform, userRole);
      if (!enabled) {
        disabledFeatures.push(code);
      }
    }

    if (disabledFeatures.length > 0) {
      return reply.status(403).send({
        error: "Features disabled",
        code: "FEATURES_DISABLED",
        features: disabledFeatures,
        platform,
        message: `Les fonctionnalités suivantes ne sont pas activées: ${disabledFeatures.join(", ")}`,
      });
    }
  };
}

/**
 * Crée un guard qui vérifie au moins une feature parmi plusieurs
 */
export function requireAnyFeature(featureCodes: string[]) {
  return async function anyFeatureGuard(
    req: FastifyRequest,
    reply: FastifyReply
  ) {
    if (!req.user) {
      return reply.status(401).send({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }

    const entrepriseId = req.user.entrepriseId;
    const platform = detectPlatform(req);
    const userRole = req.user.role;

    for (const code of featureCodes) {
      const enabled = await isFeatureEnabled(entrepriseId, code, platform, userRole);
      if (enabled) {
        return; // Au moins une feature est activée
      }
    }

    return reply.status(403).send({
      error: "No features enabled",
      code: "NO_FEATURES_ENABLED",
      features: featureCodes,
      platform,
      message: `Aucune des fonctionnalités suivantes n'est activée: ${featureCodes.join(", ")}`,
    });
  };
}

/**
 * Décorateur pour ajouter les infos de feature au request
 * Utile pour le logging ou les conditions dans les handlers
 */
export function withFeatureInfo(featureCode: string) {
  return async function featureInfoMiddleware(
    req: FastifyRequest,
    _reply: FastifyReply
  ) {
    if (!req.user) return;

    const entrepriseId = req.user.entrepriseId;
    const platform = detectPlatform(req);
    const userRole = req.user.role;

    const enabled = await isFeatureEnabled(entrepriseId, featureCode, platform, userRole);

    // Ajouter au request pour utilisation ultérieure
    (req as any).featureEnabled = enabled;
    (req as any).featureCode = featureCode;
    (req as any).detectedPlatform = platform;
  };
}

// ============================================
// HELPERS
// ============================================

function detectPlatform(req: FastifyRequest): PlatformType {
  // 1. Vérifier le header explicite
  const platformHeader = req.headers["x-platform"];
  if (platformHeader) {
    const p = platformHeader.toString().toLowerCase();
    if (["desktop", "mobile", "web"].includes(p)) {
      return p as PlatformType;
    }
  }

  // 2. Vérifier le query param
  const query = req.query as { platform?: string };
  if (query.platform) {
    const p = query.platform.toLowerCase();
    if (["desktop", "mobile", "web"].includes(p)) {
      return p as PlatformType;
    }
  }

  // 3. Détecter via User-Agent
  const userAgent = (req.headers["user-agent"] || "").toString().toLowerCase();

  if (userAgent.includes("electron")) {
    return "desktop";
  }

  if (
    userAgent.includes("mobile") ||
    userAgent.includes("android") ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipad")
  ) {
    return "mobile";
  }

  return "web";
}

export default {
  requireFeature,
  requireFeatures,
  requireAnyFeature,
  withFeatureInfo,
};
