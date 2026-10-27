/**
 * Guardia de base de datos (auditoría S-19). Se ejecuta antes de comandos que ESCRIBEN en la base
 * (migraciones, semillas, reinicios). Si DATABASE_URL apunta a un servidor que no es local, se detiene
 * salvo que se confirme explícitamente con ALLOW_REMOTE_DB=1.
 *
 * Uso: node scripts/db-guard.mjs <accion>
 */
import "dotenv/config";

const action = process.argv[2] ?? "operar";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres", "postgres-dev", "postgres-test", "db"];

let host = "";
try {
  host = new URL(process.env.DATABASE_URL ?? "").hostname;
} catch {
  console.error("[db-guard] DATABASE_URL no está definida o no es una URL válida.");
  process.exit(1);
}

if (LOCAL_HOSTS.includes(host) || process.env.ALLOW_REMOTE_DB === "1") {
  if (!LOCAL_HOSTS.includes(host)) {
    console.warn(`[db-guard] ATENCIÓN: ${action} sobre una base REMOTA (${host}) autorizado con ALLOW_REMOTE_DB=1.`);
  }
  process.exit(0);
}

console.error(`
[db-guard] Se detuvo "${action}": DATABASE_URL apunta a un servidor remoto (${host}).
Esto escribiría en una base compartida. Opciones:
  1) Usar la base local:  pnpm db:dev:up  y  DATABASE_URL=postgresql://postgres:dev@localhost:55434/checkapp_dev
  2) Si de verdad quieres operar sobre la remota:  ALLOW_REMOTE_DB=1 pnpm <comando>
`);
process.exit(1);
