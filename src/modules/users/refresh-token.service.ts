import { createHash, randomBytes } from "crypto";
import { prismaClient } from "@src/core/config/database";

const REFRESH_DAYS = 30;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Crea un refresh opaco; la base solo guarda su hash. */
export const issueRefreshToken = async (userId: number): Promise<string> => {
  const token = randomBytes(48).toString("base64url");
  await prismaClient.refreshToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
};

/** Rota el refresh: invalida el actual y devuelve el userId + uno nuevo. */
export const rotateRefreshToken = async (rawToken: string): Promise<{ userId: number; token: string } | null> => {
  const row = await prismaClient.refreshToken.findUnique({
    where: { tokenHash: hash(rawToken) },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, user: { select: { active: true, softDelete: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt <= new Date() || !row.user.active || row.user.softDelete) return null;

  const { count } = await prismaClient.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count !== 1) return null;

  return { userId: row.userId, token: await issueRefreshToken(row.userId) };
};

export const revokeRefreshToken = async (rawToken: string): Promise<void> => {
  await prismaClient.refreshToken.updateMany({
    where: { tokenHash: hash(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const revokeAllRefreshTokens = async (userId: number): Promise<void> => {
  await prismaClient.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};
