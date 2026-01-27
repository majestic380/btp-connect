/**
 * BTP Connect v9.3.0 - Main Server
 * 
 * Production-ready Fastify server with:
 * - Security hardening (CORS, Helmet, Rate Limiting)
 * - Centralized error handling
 * - Comprehensive health checks
 * - JWT authentication
 * - All business routes
 */

import "dotenv/config";
import Fastify from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Plugins
import { registerSecurity } from "./plugins/security.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerJwt } from "./plugins/jwt.js";
import { registerSwagger } from "./plugins/swagger.js";
import { registerMultipart } from "./plugins/multipart.js";

// Routes
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { stRoutes } from "./routes/st.js";
import { chantiersRoutes } from "./routes/chantiers.js";
import { adminRoutes } from "./routes/admin.js";
import { contratsRoutes } from "./routes/contrats.js";
import { facturesRoutes } from "./routes/factures.js";
import { documentsRoutes } from "./routes/documents.js";
// Modules Visiobat v9.0
import { marchesRoutes } from "./routes/marches.js";
import { comptesRendusRoutes } from "./routes/comptes-rendus.js";
import { visionneuseRoutes } from "./routes/visionneuse.js";
import { appelOffresRoutes } from "./routes/appels-offres.js";
// Feature Flags v9.0
import { featureFlagsRoutes } from "./routes/feature-flags.js";
// Email Routes v9.2
import { emailRoutes } from "./routes/email.js";

// v9.4 - Journal / Planning / Alertes / Achats
import { journalRoutes } from "./routes/journal.js";
import { planningRoutes } from "./routes/planning.js";
import { alertsRoutes } from "./routes/alerts.js";
import { achatsRoutes } from "./routes/achats.js";

// Guards
import { requireAuth, initDemoUser } from "./guards/auth.js";

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const VERSION = "9.3.0";
const isProduction = process.env.NODE_ENV === 'production';

// Logger configuration
const loggerConfig = {
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction ? {} : {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }),
  // Redact sensitive fields in logs
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.passwordHash'],
    censor: '[REDACTED]'
  }
};

// Create Fastify instance
const app = Fastify({ 
  logger: loggerConfig,
  trustProxy: isProduction // Trust proxy headers in production (for X-Forwarded-For)
});

// ══════════════════════════════════════════════════════════════════════════════
// STARTUP BANNER
// ══════════════════════════════════════════════════════════════════════════════

function printBanner(): void {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                                                              ║");
  console.log(`║   🏗️  BTP Connect v${VERSION}                                   ║`);
  console.log("║   Application de gestion BTP                                 ║");
  console.log("║                                                              ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║   Environment: ${(isProduction ? 'PRODUCTION' : 'DEVELOPMENT').padEnd(44)}║`);
  console.log(`║   Node.js:     ${process.version.padEnd(44)}║`);
  console.log("║                                                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
}

// ══════════════════════════════════════════════════════════════════════════════
// REGISTER PLUGINS & MIDDLEWARES
// ══════════════════════════════════════════════════════════════════════════════

// Decorate app with authenticate function for route guards
app.decorate("authenticate", requireAuth);

// Security plugins (CORS, Helmet, Rate Limiting)
await registerSecurity(app);

// Centralized error handler
await registerErrorHandler(app);

// JWT authentication
await registerJwt(app);

// Swagger API documentation
await registerSwagger(app);

// Multipart file uploads
await registerMultipart(app);

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH ROUTES (no prefix)
// ══════════════════════════════════════════════════════════════════════════════

await app.register(healthRoutes);

// ══════════════════════════════════════════════════════════════════════════════
// STATIC FILE SERVING (PWA & Admin UI)
// ══════════════════════════════════════════════════════════════════════════════

const pwaRoot = join(process.cwd(), "src", "static", "pwa");

// Helper to send static files
function sendStaticFile(filePath: string, contentType: string, reply: any) {
  try {
    const buf = readFileSync(filePath);
    reply.header("Content-Type", contentType);
    return reply.send(buf);
  } catch (error) {
    return reply.status(404).send({ error: "File not found" });
  }
}

// Admin UI
app.get("/admin-ui", async (_req, reply) => {
  const adminPath = join(process.cwd(), "src", "static", "admin-ui.html");
  if (existsSync(adminPath)) {
    const html = readFileSync(adminPath, "utf-8");
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  }
  return reply.status(404).send({ error: "Admin UI not found" });
});

// PWA Root
app.get("/", async (_req, reply) => {
  return sendStaticFile(join(pwaRoot, "index.html"), "text/html; charset=utf-8", reply);
});

// PWA Manifest
app.get("/manifest.webmanifest", async (_req, reply) => {
  return sendStaticFile(join(pwaRoot, "manifest.webmanifest"), "application/manifest+json; charset=utf-8", reply);
});

// PWA Service Worker
app.get("/sw.js", async (_req, reply) => {
  reply.header("Cache-Control", "no-cache");
  return sendStaticFile(join(pwaRoot, "sw.js"), "application/javascript; charset=utf-8", reply);
});

// PWA Icons
app.get("/icons/:name", async (req, reply) => {
  const name = (req.params as { name: string }).name;
  if (!/^icon-(192|512)(-maskable)?\.png$/.test(name)) {
    return reply.status(404).send({ error: "Icon not found" });
  }
  reply.header("Cache-Control", "public, max-age=86400");
  return sendStaticFile(join(pwaRoot, "icons", name), "image/png", reply);
});

// Project Download
app.get("/download/project", async (_req, reply) => {
  const exportPath = join(pwaRoot, "btp-connect-v9.3.0.zip");
  const fallbackPath = join(pwaRoot, "BTP-CONNECT-v8.12-FINAL.zip");
  
  const actualPath = existsSync(exportPath) ? exportPath : fallbackPath;
  const filename = existsSync(exportPath) ? "btp-connect-v9.3.0.zip" : "BTP-CONNECT-v8.12-FINAL.zip";
  
  if (!existsSync(actualPath)) {
    return reply.status(404).send({ error: "Export file not found" });
  }
  
  const buf = readFileSync(actualPath);
  reply.header("Content-Type", "application/zip");
  reply.header("Content-Disposition", `attachment; filename=${filename}`);
  return reply.send(buf);
});

// ══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Core routes
await app.register(authRoutes, { prefix: '/api' });
await app.register(stRoutes, { prefix: '/api' });
await app.register(chantiersRoutes, { prefix: '/api' });
await app.register(adminRoutes, { prefix: '/api' });
await app.register(contratsRoutes, { prefix: '/api' });
await app.register(facturesRoutes, { prefix: '/api' });
await app.register(documentsRoutes, { prefix: '/api' });

// Visiobat modules v9.0
await app.register(marchesRoutes, { prefix: '/api' });
await app.register(comptesRendusRoutes, { prefix: '/api' });
await app.register(visionneuseRoutes, { prefix: '/api' });
await app.register(appelOffresRoutes, { prefix: '/api' });

// Feature Flags v9.0
await app.register(featureFlagsRoutes, { prefix: '/api' });

// Email v9.2
await app.register(emailRoutes, { prefix: '/api' });

// v9.4 - Journal / Planning / Alertes / Achats
await app.register(journalRoutes, { prefix: '/api' });
await app.register(planningRoutes, { prefix: '/api' });
await app.register(alertsRoutes, { prefix: '/api' });
await app.register(achatsRoutes, { prefix: '/api' });


// ══════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ══════════════════════════════════════════════════════════════════════════════

const port = Number(process.env.PORT || 3000);
const host = (process.env.HOST?.trim()) || "127.0.0.1";

// Initialize demo user for AUTH_BYPASS mode (development only)
try {
  await initDemoUser();
} catch (error) {
  // If AUTH_BYPASS is blocked in production, this will throw
  // The error is already logged in initDemoUser
  if (isProduction) {
    process.exit(1);
  }
}

// Print banner
printBanner();

// Start server
try {
  await app.listen({ port, host });
  
  app.log.info({
    version: VERSION,
    host,
    port,
    environment: isProduction ? 'production' : 'development',
    docs: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/docs`
  }, '🚀 Server started successfully');
  
} catch (error) {
  app.log.fatal({ error }, 'Failed to start server');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════════════════════

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Received shutdown signal');
  
  try {
    await app.close();
    app.log.info('Server closed gracefully');
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
