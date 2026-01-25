/**
 * BTP Connect v9.3.0 - Security Plugins
 * 
 * Environment-aware configuration:
 * - Development: Permissive settings for easy testing
 * - Production: Strict security with CSP, CORS whitelist, rate limiting
 */

import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

/**
 * Check if running in production environment
 */
function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Parse comma-separated origins from environment variable
 */
function parseAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  
  if (envOrigins) {
    return envOrigins
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
  }
  
  // Default development origins
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8001',
    'http://127.0.0.1:8001',
    'http://localhost:5173',  // Vite dev server
    'http://127.0.0.1:5173'
  ];
}

/**
 * Register all security plugins with environment-aware configuration
 */
export async function registerSecurity(app: FastifyInstance): Promise<void> {
  const isProduction = isProductionEnv();
  const allowedOrigins = parseAllowedOrigins();

  // ══════════════════════════════════════════════════════════════════
  // HELMET - HTTP Security Headers
  // ══════════════════════════════════════════════════════════════════
  await app.register(helmet, {
    // Content Security Policy
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",   // Required for inline scripts in index.html
          "'unsafe-eval'",     // Required for some libraries (Chart.js, etc.)
          "cdn.tailwindcss.com",
          "cdn.jsdelivr.net",
          "cdnjs.cloudflare.com",
          "cdn.sheetjs.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",   // Required for Tailwind
          "fonts.googleapis.com",
          "cdn.tailwindcss.com"
        ],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "fonts.gstatic.com", "data:"],
        connectSrc: [
          "'self'",
          ...allowedOrigins,
          "ws://localhost:*",   // WebSocket for dev
          "wss://*"             // WebSocket for prod
        ],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    } : false, // Disabled in development
    
    // Cross-Origin policies
    crossOriginEmbedderPolicy: isProduction,
    crossOriginOpenerPolicy: isProduction ? { policy: "same-origin" } : false,
    crossOriginResourcePolicy: isProduction ? { policy: "same-origin" } : false,
    
    // Clickjacking protection
    frameguard: isProduction ? { action: "deny" } : false,
    
    // HSTS - Force HTTPS (1 year)
    hsts: isProduction ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,
    
    // Always-on protections
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    dnsPrefetchControl: { allow: false },
    ieNoOpen: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" }
  });

  // ══════════════════════════════════════════════════════════════════
  // CORS - Cross-Origin Resource Sharing
  // ══════════════════════════════════════════════════════════════════
  await app.register(cors, {
    origin: isProduction 
      ? (origin, callback) => {
          // Allow requests with no origin (mobile apps, curl, Postman)
          if (!origin) {
            return callback(null, true);
          }
          
          // Check against whitelist
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            app.log.warn({ 
              origin, 
              allowed: allowedOrigins 
            }, "CORS: Origin rejected");
            callback(new Error(`Origin ${origin} not allowed by CORS`), false);
          }
        }
      : true, // Allow all origins in development
    
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-API-Key'
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page',
      'X-Per-Page',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Content-Disposition'
    ],
    maxAge: 86400, // 24 hours preflight cache
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  // ══════════════════════════════════════════════════════════════════
  // RATE LIMITING - DDoS & Brute Force Protection
  // ══════════════════════════════════════════════════════════════════
  const maxRequests = isProduction ? 100 : 300;
  
  await app.register(rateLimit, {
    global: true,
    max: maxRequests,
    timeWindow: "1 minute",
    
    // Use user ID if authenticated, otherwise use IP
    keyGenerator: (request) => {
      const user = (request as any).user;
      return user?.sub || request.ip;
    },
    
    // Custom error response
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Limite de ${context.max} requêtes par minute dépassée. Réessayez dans ${Math.ceil(context.ttl / 1000)} secondes.`,
      retryAfter: Math.ceil(context.ttl / 1000)
    }),
    
    // Skip rate limiting for health checks
    allowList: (request) => {
      return request.url.startsWith('/health');
    },
    
    // Add rate limit headers to responses
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // LOG SECURITY CONFIGURATION
  // ══════════════════════════════════════════════════════════════════
  const securityConfig = {
    environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
    cors: {
      mode: isProduction ? 'whitelist' : 'allow-all',
      origins: isProduction ? allowedOrigins : ['*']
    },
    helmet: {
      csp: isProduction ? 'enabled' : 'disabled',
      hsts: isProduction ? '1 year' : 'disabled'
    },
    rateLimit: {
      maxPerMinute: maxRequests,
      keyBy: 'user-id or ip'
    }
  };

  app.log.info(securityConfig, '🔒 Security configuration loaded');
}
