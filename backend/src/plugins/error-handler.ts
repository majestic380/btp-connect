/**
 * BTP Connect v9.3.0 - Centralized Error Handler
 * 
 * Handles all error types with appropriate responses:
 * - Zod validation errors
 * - Prisma database errors
 * - JWT authentication errors
 * - Rate limit errors
 * - Generic application errors
 */

import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/**
 * Check if running in production environment
 */
function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Register the centralized error handler
 */
export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  const isProduction = isProductionEnv();

  // ══════════════════════════════════════════════════════════════════
  // MAIN ERROR HANDLER
  // ══════════════════════════════════════════════════════════════════
  app.setErrorHandler((
    error: FastifyError, 
    request: FastifyRequest, 
    reply: FastifyReply
  ) => {
    // Log error with context (redact sensitive data in production)
    app.log.error({
      err: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        name: error.name,
        stack: isProduction ? undefined : error.stack
      },
      request: {
        id: request.id,
        method: request.method,
        url: request.url,
        params: request.params,
        userId: (request as any).user?.sub
      }
    }, 'Request error');

    // ────────────────────────────────────────────────────────────────
    // ZOD Validation Errors
    // ────────────────────────────────────────────────────────────────
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: "Les données fournies sont invalides.",
        details: error.flatten()
      });
    }

    // ────────────────────────────────────────────────────────────────
    // PRISMA Known Request Errors
    // ────────────────────────────────────────────────────────────────
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return handlePrismaError(error, reply, isProduction);
    }

    // ────────────────────────────────────────────────────────────────
    // PRISMA Validation Errors
    // ────────────────────────────────────────────────────────────────
    if (error instanceof Prisma.PrismaClientValidationError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Database Validation Error",
        message: isProduction 
          ? "Erreur de validation des données."
          : error.message.split('\n').slice(-3).join(' ')
      });
    }

    // ────────────────────────────────────────────────────────────────
    // PRISMA Connection Errors
    // ────────────────────────────────────────────────────────────────
    if (error instanceof Prisma.PrismaClientInitializationError) {
      app.log.fatal({ error }, 'Database connection failed');
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Base de données temporairement indisponible."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // JWT Errors
    // ────────────────────────────────────────────────────────────────
    if (error.code?.startsWith('FST_JWT')) {
      const messages: Record<string, string> = {
        'FST_JWT_NO_AUTHORIZATION_IN_HEADER': "Token d'authentification manquant.",
        'FST_JWT_AUTHORIZATION_TOKEN_INVALID': "Token d'authentification invalide.",
        'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED': "Token expiré. Veuillez vous reconnecter."
      };
      
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: messages[error.code] || "Erreur d'authentification.",
        code: error.code
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Rate Limit Errors
    // ────────────────────────────────────────────────────────────────
    if (error.statusCode === 429) {
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Trop de requêtes. Veuillez réessayer plus tard."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // File Upload Errors
    // ────────────────────────────────────────────────────────────────
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({
        statusCode: 413,
        error: "Payload Too Large",
        message: "Le fichier est trop volumineux."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Not Found Errors
    // ────────────────────────────────────────────────────────────────
    if (error.statusCode === 404) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: error.message || "Ressource non trouvée."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Default Error Response
    // ────────────────────────────────────────────────────────────────
    const statusCode = error.statusCode || 500;
    
    return reply.status(statusCode).send({
      statusCode,
      error: statusCode >= 500 ? "Internal Server Error" : "Error",
      message: isProduction && statusCode >= 500
        ? "Une erreur interne s'est produite. Veuillez réessayer."
        : error.message,
      ...(isProduction ? {} : { 
        stack: error.stack,
        code: error.code 
      })
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 404 HANDLER FOR UNMATCHED ROUTES
  // ══════════════════════════════════════════════════════════════════
  app.setNotFoundHandler((request, reply) => {
    app.log.warn({ 
      url: request.url, 
      method: request.method,
      ip: request.ip 
    }, 'Route not found');
    
    return reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: `Route ${request.method} ${request.url} non trouvée.`
    });
  });

  app.log.info('✅ Error handler registered');
}

/**
 * Handle Prisma-specific errors with user-friendly messages
 */
function handlePrismaError(
  error: Prisma.PrismaClientKnownRequestError,
  reply: FastifyReply,
  isProduction: boolean
): FastifyReply {
  const meta = error.meta as Record<string, unknown> | undefined;

  switch (error.code) {
    // ────────────────────────────────────────────────────────────────
    // P2002 - Unique constraint violation
    // ────────────────────────────────────────────────────────────────
    case 'P2002': {
      const target = meta?.target as string[] | string | undefined;
      const field = Array.isArray(target) ? target[0] : target;
      return reply.status(409).send({
        statusCode: 409,
        error: "Conflict",
        message: field 
          ? `Un enregistrement avec ce ${field} existe déjà.`
          : "Un enregistrement avec cette valeur existe déjà.",
        field
      });
    }

    // ────────────────────────────────────────────────────────────────
    // P2003 - Foreign key constraint violation
    // ────────────────────────────────────────────────────────────────
    case 'P2003': {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Référence invalide vers une ressource inexistante."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // P2001, P2025 - Record not found
    // ────────────────────────────────────────────────────────────────
    case 'P2001':
    case 'P2025': {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Enregistrement non trouvé."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // P2011 - Null constraint violation
    // ────────────────────────────────────────────────────────────────
    case 'P2011': {
      const field = meta?.constraint as string | undefined;
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: field 
          ? `Le champ ${field} est requis.`
          : "Un champ requis est manquant.",
        field
      });
    }

    // ────────────────────────────────────────────────────────────────
    // P2006 - Invalid data type
    // ────────────────────────────────────────────────────────────────
    case 'P2006': {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Type de données invalide."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // P1001, P1002 - Database connection errors
    // ────────────────────────────────────────────────────────────────
    case 'P1001':
    case 'P1002': {
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Base de données temporairement indisponible."
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Default Prisma error
    // ────────────────────────────────────────────────────────────────
    default: {
      return reply.status(400).send({
        statusCode: 400,
        error: "Database Error",
        code: isProduction ? undefined : error.code,
        message: isProduction 
          ? "Une erreur de base de données s'est produite."
          : error.message
      });
    }
  }
}
