/**
 * Misma regla que scripts/db-guard.mjs, para cuando la semilla se corre directo con `prisma db seed`
 * (auditoría S-19): no escribir en una base remota sin confirmación explícita.
 */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres", "postgres-dev", "postgres-test", "db"];

export const assertSafeDatabase = (action: string): void => {
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    throw new Error("[db-guard] DATABASE_URL no está definida o no es una URL válida.");
  }
  if (LOCAL_HOSTS.includes(host)) return;
  if (process.env.ALLOW_REMOTE_DB === "1") {
    console.warn(`[db-guard] ATENCIÓN: ${action} sobre una base REMOTA (${host}) autorizado con ALLOW_REMOTE_DB=1.`);
    return;
  }
  throw new Error(`[db-guard] "${action}" detenido: DATABASE_URL apunta a un servidor remoto (${host}). Usa la base local (pnpm db:dev:up) o confirma con ALLOW_REMOTE_DB=1.`);
};
