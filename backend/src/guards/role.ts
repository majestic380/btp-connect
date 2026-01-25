import type { FastifyRequest, FastifyReply } from "fastify";

// Note: With SQLite migration, Role is now a string, not an enum
type RoleString = "ADMIN" | "CONDUCTEUR" | "COMPTABLE";

export function requireRole(roles: RoleString[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    
    // In AUTH_BYPASS mode, demo user is always ADMIN
    if (process.env.AUTH_BYPASS === "1" && user) {
      // Demo user has ADMIN role, so all roles are permitted
      return;
    }
    
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    if (!roles.includes(user.role as RoleString)) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}
