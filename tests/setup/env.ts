/**
 * Se ejecuta antes de cargar cada archivo de prueba (setupFiles).
 * Fija el entorno ANTES de que se importen configuración o Prisma.
 */
import { TEST_DATABASE_URL_DEFAULT, assertSafeTestDatabase } from "./safety";

const testUrl = process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL_DEFAULT;
assertSafeTestDatabase(testUrl);

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testUrl;
process.env.APP_SECRET = process.env.APP_SECRET_TEST ?? "test-only-secret-do-not-use-in-production";

// Servicios externos desactivados: las pruebas nunca publican ni envían nada real.
// Se fijan en cadena VACÍA (no se borran): `src/core/config/config.ts` llama a dotenv, que
// rellenaría las variables ausentes desde el `.env` local (claves reales de Ably, S3, Maps...).
// dotenv no pisa las que ya existen, y todo el código las trata como "no configurado".
for (const key of [
  "ABLY_KEY",
  "RESEND_API_KEY",
  "AWS_BUCKET_NAME",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "GOOGLE_MAPS_API_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
]) {
  process.env[key] = "";
}
