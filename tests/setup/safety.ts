/**
 * Guardia de seguridad para el harness de pruebas.
 *
 * Las pruebas BORRAN datos (TRUNCATE y migrate reset). Este módulo impide que
 * apunten a cualquier base que no sea una base de prueba local. Es la defensa
 * contra correr la suite con la DATABASE_URL de operación (ver S-08 en docs).
 */

export const TEST_DATABASE_URL_DEFAULT =
  "postgresql://postgres:test@localhost:55433/checkapp_test";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Lanza un error si la URL no es claramente una base de prueba local. */
export const assertSafeTestDatabase = (url: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("[tests] TEST_DATABASE_URL no es una URL válida.");
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `[tests] Negado: el nombre de base "${dbName}" debe terminar en "_test". ` +
        "Las pruebas borran datos; no las apuntes a operación.",
    );
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[tests] Negado: el host "${parsed.hostname}" no es local. ` +
        "Las pruebas solo corren contra una base de prueba local.",
    );
  }
};
