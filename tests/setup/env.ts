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
delete process.env.ABLY_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.AWS_BUCKET_NAME;
delete process.env.GOOGLE_MAPS_API_KEY;
