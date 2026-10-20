import { PrismaClient } from '@prisma/client';

/**
 * Agrega los límites del pool a la URL de conexión si se configuraron por
 * entorno (E-14). Sin variables, la URL se usa tal cual.
 * PRISMA_CONNECTION_LIMIT y PRISMA_POOL_TIMEOUT (segundos).
 */
export const buildDatabaseUrl = (url: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined => {
  if (!url) return url;
  const parsed = new URL(url);
  if (env.PRISMA_CONNECTION_LIMIT && !parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', env.PRISMA_CONNECTION_LIMIT);
  }
  if (env.PRISMA_POOL_TIMEOUT && !parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', env.PRISMA_POOL_TIMEOUT);
  }
  return parsed.toString();
};

export const prismaClient = new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl(process.env.DATABASE_URL) } },
});
