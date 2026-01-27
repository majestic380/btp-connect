import type { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";

export async function registerJwt(app: FastifyInstance) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  if (!accessSecret) throw new Error("Missing JWT_ACCESS_SECRET");

  await app.register(jwt, {
    secret: accessSecret,
    sign: { expiresIn: process.env.JWT_ACCESS_TTL || "15m" }
  });
}
