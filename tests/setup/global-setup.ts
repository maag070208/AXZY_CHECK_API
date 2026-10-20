/**
 * Se ejecuta UNA vez antes de toda la suite: recrea el esquema de la base de
 * prueba aplicando las migraciones reales (no `db push`), para que las pruebas
 * validen exactamente lo que se desplegará.
 */
import { execSync } from "child_process";
import path from "path";
import { TEST_DATABASE_URL_DEFAULT, assertSafeTestDatabase } from "./safety";

export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL_DEFAULT;
  assertSafeTestDatabase(url);

  const root = path.resolve(__dirname, "..", "..");
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
