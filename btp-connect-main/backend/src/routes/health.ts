/**
 * BTP Connect v9.3.0 - Health Check Routes
 * 
 * Endpoints for monitoring and orchestration:
 * - /health - Main health status with all checks
 * - /health/ready - Readiness probe (for load balancers)
 * - /health/live - Liveness probe (for container orchestration)
 * - /health/metrics - Detailed metrics (protected)
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

// Version from package.json or fallback
const VERSION = process.env.npm_package_version || "9.3.0";

interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  uptime: number;
  environment: string;
  checks: {
    database: "ok" | "slow" | "error";
    memory: "ok" | "warning" | "critical";
  };
  latency?: {
    database: number;
  };
  metrics?: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
}

/**
 * Register health check routes
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // MAIN HEALTH ENDPOINT
  // Comprehensive status with all checks
  // ══════════════════════════════════════════════════════════════════
  app.get("/health", async (_request, reply) => {
    const health: HealthStatus = {
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      checks: {
        database: "ok",
        memory: "ok"
      }
    };

    // ────────────────────────────────────────────────────────────────
    // Database Check
    // ────────────────────────────────────────────────────────────────
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;
      
      health.latency = { database: dbLatency };
      
      if (dbLatency > 1000) {
        health.checks.database = "slow";
        health.status = "degraded";
        app.log.warn({ latency: dbLatency }, 'Database responding slowly');
      }
    } catch (error) {
      health.status = "unhealthy";
      health.checks.database = "error";
      app.log.error({ error }, 'Database health check failed');
    }

    // ────────────────────────────────────────────────────────────────
    // Memory Check
    // ────────────────────────────────────────────────────────────────
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);

    // Memory thresholds
    if (heapUsedMB < 256) {
      health.checks.memory = "ok";
    } else if (heapUsedMB < 512) {
      health.checks.memory = "warning";
      if (health.status === "ok") {
        health.status = "degraded";
      }
    } else {
      health.checks.memory = "critical";
      health.status = "degraded";
      app.log.warn({ heapUsedMB }, 'High memory usage detected');
    }

    // Include metrics in non-production or if explicitly requested
    const showMetrics = process.env.NODE_ENV !== 'production' || 
                        process.env.HEALTH_VERBOSE === '1';
    if (showMetrics) {
      health.metrics = { heapUsedMB, heapTotalMB, rssMB };
    }

    // Return appropriate HTTP status
    const statusCode = health.status === "unhealthy" ? 503 : 200;
    return reply.status(statusCode).send(health);
  });

  // ══════════════════════════════════════════════════════════════════
  // READINESS PROBE
  // Is the service ready to accept traffic?
  // Used by Kubernetes / Load Balancers
  // ══════════════════════════════════════════════════════════════════
  app.get("/health/ready", async (_request, reply) => {
    try {
      // Check database connection
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      
      return reply.status(200).send({
        ready: true,
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          latencyMs: latency
        }
      });
    } catch (error) {
      app.log.error({ error }, 'Readiness check failed');
      
      return reply.status(503).send({
        ready: false,
        timestamp: new Date().toISOString(),
        reason: "database_unavailable",
        database: {
          connected: false
        }
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // LIVENESS PROBE
  // Is the process alive and not stuck?
  // Used by container orchestrators to detect hung processes
  // ══════════════════════════════════════════════════════════════════
  app.get("/health/live", async (_request, reply) => {
    return reply.status(200).send({
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
      version: VERSION
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DETAILED METRICS ENDPOINT
  // Full system metrics for monitoring dashboards
  // Protected by API key in production
  // ══════════════════════════════════════════════════════════════════
  app.get("/health/metrics", {
    preHandler: async (request, reply) => {
      // Require API key in production
      if (process.env.NODE_ENV === 'production') {
        const apiKey = process.env.METRICS_API_KEY;
        const providedKey = request.headers['x-metrics-key'] || 
                           request.headers['authorization']?.replace('Bearer ', '');
        
        if (!apiKey) {
          app.log.warn('METRICS_API_KEY not set, metrics endpoint disabled');
          return reply.status(503).send({ 
            error: "Service Unavailable",
            message: "Metrics endpoint not configured" 
          });
        }
        
        if (providedKey !== apiKey) {
          return reply.status(403).send({ 
            error: "Forbidden",
            message: "Invalid or missing metrics API key" 
          });
        }
      }
    }
  }, async (_request, reply) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Database statistics
    let dbStats: Record<string, unknown> = { available: false };
    try {
      const [entreprises, chantiers, users, sousTraitants] = await Promise.all([
        prisma.entreprise.count(),
        prisma.chantier.count(),
        prisma.user.count(),
        prisma.sousTraitant.count()
      ]);
      
      dbStats = {
        available: true,
        counts: {
          entreprises,
          chantiers,
          users,
          sousTraitants
        }
      };
    } catch (error) {
      dbStats = { 
        available: false, 
        error: "Unable to fetch database stats" 
      };
    }

    return reply.send({
      timestamp: new Date().toISOString(),
      version: VERSION,
      environment: process.env.NODE_ENV || "development",
      
      process: {
        pid: process.pid,
        ppid: process.ppid,
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
        // Human readable
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024)
      },
      
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        // In seconds
        userSeconds: Math.round(cpuUsage.user / 1000000),
        systemSeconds: Math.round(cpuUsage.system / 1000000)
      },
      
      database: dbStats
    });
  });

  app.log.info('✅ Health routes registered: /health, /health/ready, /health/live, /health/metrics');
}
