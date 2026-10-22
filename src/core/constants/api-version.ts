/**
 * Versión del CONTRATO de la API. Se sube a mano/script cuando cambia algo que
 * el cliente debe conocer (endpoint, payload, semántica, mínimos de APP).
 *
 * - patch: fix compatible
 * - minor: nueva capacidad compatible
 * - major: cambio incompatible (la APP debe actualizarse)
 */
export const API_VERSION = "1.1.0";
export const API_MAJOR = Number(API_VERSION.split(".")[0]);
export const API_MIN_APP_VERSION = "1.0.23";

export const API_CAPABILITIES = [
  "offline.clientRef",
  "offline.roundId",
  "offline.reportQueue",
  "uploads.idempotency",
  "permissions.notifications",
] as const;

/** Identifica el build exacto que está corriendo (se actualiza solo en cada deploy). */
export const API_BUILD_VERSION =
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT ??
  process.env.npm_package_version ??
  "dev";

export const API_META = {
  apiVersion: API_VERSION,
  apiMajor: API_MAJOR,
  minAppVersion: API_MIN_APP_VERSION,
  capabilities: API_CAPABILITIES,
  buildVersion: API_BUILD_VERSION,
};
