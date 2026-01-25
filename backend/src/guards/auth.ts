/**
 * BTP Connect v9.3.0 - Authentication Guards
 * 
 * SECURITY FEATURES:
 * - AUTH_BYPASS blocked in production
 * - JWT verification with proper error handling
 * - Demo user for development only
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

// Demo user cache for AUTH_BYPASS mode (DEVELOPMENT ONLY)
let demoUser: {
  sub: string;
  entrepriseId: string;
  role: string;
  email: string;
} | null = null;

/**
 * Check if running in production environment
 */
function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Initialize demo user when AUTH_BYPASS is enabled
 * 
 * ⚠️ SECURITY: This function is BLOCKED in production
 * It will throw an error if AUTH_BYPASS=1 and NODE_ENV=production
 */
export async function initDemoUser(): Promise<void> {
  // 🔒 CRITICAL SECURITY: Block AUTH_BYPASS in production
  if (process.env.AUTH_BYPASS === "1" && isProductionEnv()) {
    console.error("");
    console.error("╔══════════════════════════════════════════════════════════════╗");
    console.error("║  ❌ SECURITY ERROR: AUTH_BYPASS is BLOCKED in production!    ║");
    console.error("║                                                              ║");
    console.error("║  AUTH_BYPASS=1 was detected but NODE_ENV=production          ║");
    console.error("║  This is a critical security violation.                      ║");
    console.error("║                                                              ║");
    console.error("║  To fix: Remove AUTH_BYPASS from environment variables       ║");
    console.error("╚══════════════════════════════════════════════════════════════╝");
    console.error("");
    throw new Error("SECURITY: AUTH_BYPASS is disabled in production mode.");
  }
  
  // Skip if AUTH_BYPASS is not enabled
  if (process.env.AUTH_BYPASS !== "1") {
    return;
  }

  // Development mode warning
  console.warn("");
  console.warn("╔══════════════════════════════════════════════════════════════╗");
  console.warn("║  ⚠️  AUTH_BYPASS=1 → Mode NO LOGIN activé                     ║");
  console.warn("║                                                              ║");
  console.warn("║  This mode is for DEVELOPMENT ONLY.                          ║");
  console.warn("║  All API requests will be authenticated as demo user.        ║");
  console.warn("║                                                              ║");
  console.warn("║  ❌ NEVER use this in production!                             ║");
  console.warn("╚══════════════════════════════════════════════════════════════╝");
  console.warn("");

  try {
    // Find the company with the most data (likely the seed data)
    const entreprises = await prisma.entreprise.findMany({
      include: {
        _count: {
          select: { chantiers: true, sousTraitants: true, users: true }
        }
      }
    });

    // Sort by activity (chantiers + sous-traitants) descending
    entreprises.sort((a, b) => 
      (b._count.chantiers + b._count.sousTraitants) - 
      (a._count.chantiers + a._count.sousTraitants)
    );
    
    let entreprise = entreprises[0];

    // Create default company if none exists
    if (!entreprise) {
      entreprise = await prisma.entreprise.create({
        data: {
          nom: "BTP Excellence SAS",
          siret: "12345678900012",
          plan: "pro"
        }
      }) as typeof entreprise;
      console.log("✅ [AUTH_BYPASS] Entreprise créée:", entreprise.id);
    } else {
      const count = entreprise as typeof entreprise & { _count?: { chantiers: number; sousTraitants: number } };
      console.log("✅ [AUTH_BYPASS] Entreprise trouvée:", entreprise.nom, 
        `(${count._count?.chantiers || 0} chantiers, ${count._count?.sousTraitants || 0} ST)`);
    }

    // Find admin user in this company
    let user = await prisma.user.findFirst({
      where: { 
        entrepriseId: entreprise.id,
        role: "ADMIN"
      }
    });

    // Fallback: find any user in this company
    if (!user) {
      user = await prisma.user.findFirst({
        where: { entrepriseId: entreprise.id }
      });
    }

    // Fallback: find global admin user
    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: "admin@btpconnect.local" }
      });
      
      // Update their company if needed
      if (user && user.entrepriseId !== entreprise.id) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { entrepriseId: entreprise.id }
        });
        console.log("✅ [AUTH_BYPASS] User ADMIN associé à l'entreprise");
      }
    }

    // Last resort: create a new admin user
    if (!user) {
      const uniqueEmail = `admin_bypass_${Date.now()}@btpconnect.local`;
      user = await prisma.user.create({
        data: {
          entrepriseId: entreprise.id,
          email: uniqueEmail,
          passwordHash: "BYPASS_NO_PASSWORD_HASH",
          role: "ADMIN"
        }
      });
      console.log("✅ [AUTH_BYPASS] User ADMIN créé:", user.email);
    } else {
      console.log("✅ [AUTH_BYPASS] User trouvé:", user.email, `(${user.role})`);
    }

    // Cache the demo user
    demoUser = {
      sub: user.id,
      entrepriseId: user.entrepriseId,
      role: user.role,
      email: user.email
    };

    console.log("✅ [AUTH_BYPASS] Demo user prêt - entrepriseId:", demoUser.entrepriseId);
    console.log("");

  } catch (error) {
    console.error("❌ [AUTH_BYPASS] Erreur lors de l'initialisation du demo user:", error);
    throw error;
  }
}

/**
 * Authentication middleware - Required for protected routes
 * 
 * In development with AUTH_BYPASS=1: Uses demo user
 * In production: Requires valid JWT token
 */
export async function requireAuth(
  req: FastifyRequest, 
  reply: FastifyReply
): Promise<void> {
  // AUTH_BYPASS mode: ONLY allowed in non-production
  if (process.env.AUTH_BYPASS === "1" && !isProductionEnv()) {
    if (!demoUser) {
      await initDemoUser();
    }
    if (demoUser) {
      (req as any).user = demoUser;
      return;
    }
  }

  // Normal authentication flow with JWT
  try {
    await req.jwtVerify();
  } catch (error: any) {
    const message = error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED'
      ? "Token expiré. Veuillez vous reconnecter."
      : "Token d'authentification invalide ou manquant.";
    
    return reply.status(401).send({ 
      error: "Unauthorized",
      message,
      code: error.code
    });
  }
}

/**
 * Optional authentication middleware
 * Doesn't fail if no token is provided, but sets user if valid token exists
 * 
 * Useful for routes that behave differently for authenticated users
 */
export async function optionalAuth(
  req: FastifyRequest, 
  _reply: FastifyReply
): Promise<void> {
  // AUTH_BYPASS mode for development
  if (process.env.AUTH_BYPASS === "1" && !isProductionEnv()) {
    if (!demoUser) {
      try {
        await initDemoUser();
      } catch {
        // Silently fail for optional auth
      }
    }
    if (demoUser) {
      (req as any).user = demoUser;
      return;
    }
  }

  // Try to verify JWT, but don't fail if missing/invalid
  try {
    await req.jwtVerify();
  } catch {
    // Silent fail - user just won't be authenticated
    (req as any).user = null;
  }
}

/**
 * Admin-only middleware - Requires ADMIN role
 */
export async function requireAdmin(
  req: FastifyRequest, 
  reply: FastifyReply
): Promise<void> {
  // First, ensure user is authenticated
  await requireAuth(req, reply);
  
  // Check if response was already sent (auth failed)
  if (reply.sent) return;
  
  // Check admin role
  const user = (req as any).user;
  if (!user || user.role !== 'ADMIN') {
    return reply.status(403).send({
      error: "Forbidden",
      message: "Accès réservé aux administrateurs."
    });
  }
}
