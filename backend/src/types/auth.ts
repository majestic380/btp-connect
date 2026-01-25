// Role type (string in SQLite, was enum in PostgreSQL)
export type Role = "ADMIN" | "CONDUCTEUR" | "COMPTABLE";

export type AccessTokenPayload = {
  sub: string;           // userId
  entrepriseId: string;
  role: Role;
  email: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}
