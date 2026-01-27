import crypto from "crypto";

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  // SHA-256 hash to store in DB (never store raw token)
  return crypto.createHash("sha256").update(token).digest("hex");
}
