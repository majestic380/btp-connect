import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { newRefreshToken, hashToken } from "../lib/tokens.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const refreshBody = z.object({
  refreshToken: z.string().min(20)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/seed", async () => {
    const existing = await prisma.user.findFirst();
    if (existing) return { ok: true, message: "Already seeded" };

    const ent = await prisma.entreprise.create({
      data: { nom: "BTP Excellence SAS", siret: "12345678900012", plan: "pro" }
    });

    const admin = await prisma.user.create({
      data: {
        entrepriseId: ent.id,
        email: "admin@btpconnect.local",
        passwordHash: await hashPassword("Admin123!"),
        role: "ADMIN"
      }
    });

    return { ok: true, entrepriseId: ent.id, userId: admin.id, email: admin.email, password: "Admin123!" };
  });

  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return reply.status(401).send({ error: "Invalid credentials" });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return reply.status(401).send({ error: "Invalid credentials" });

    const accessToken = await reply.jwtSign({
      sub: user.id,
      entrepriseId: user.entrepriseId,
      role: user.role as "ADMIN" | "CONDUCTEUR" | "COMPTABLE",
      email: user.email
    });

    const refreshToken = newRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt }
    });

    return { accessToken, refreshToken };
  });

  app.post("/auth/refresh", async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const tokenHash = hashToken(parsed.data.refreshToken);
    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!session) return reply.status(401).send({ error: "Invalid refresh token" });
    if (session.revokedAt) return reply.status(401).send({ error: "Refresh token revoked" });
    if (session.expiresAt.getTime() < Date.now()) return reply.status(401).send({ error: "Refresh token expired" });

    // Rotate token (safer)
    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    const newToken = newRefreshToken();
    const newHash = hashToken(newToken);
    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: { userId: session.userId, tokenHash: newHash, expiresAt }
    });

    const accessToken = await reply.jwtSign({
      sub: session.user.id,
      entrepriseId: session.user.entrepriseId,
      role: session.user.role as "ADMIN" | "CONDUCTEUR" | "COMPTABLE",
      email: session.user.email
    });

    return { accessToken, refreshToken: newToken };
  });

  app.post("/auth/logout", async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });

    const tokenHash = hashToken(parsed.data.refreshToken);
    const session = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!session) return { ok: true };

    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}
