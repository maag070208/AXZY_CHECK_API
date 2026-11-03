/**
 * Versión del CONTRATO de la API. Se sube a mano/script cuando cambia algo que
 * el cliente debe conocer (endpoint, payload, semántica, mínimos de APP).
 *
 * - patch: fix compatible
 * - minor: nueva capacidad compatible
 * - major: cambio incompatible (la APP debe actualizarse)
 */
export const API_VERSION = "1.6.0";
export const API_MAJOR = Number(API_VERSION.split(".")[0]);
export const API_MIN_APP_VERSION = "1.0.23";

export const API_CAPABILITIES = [
  "offline.clientRef",
  "offline.roundId",
  "offline.reportQueue",
  "uploads.idempotency",
  "permissions.notifications",
  "records.origin",
  // Multicliente (fase 2 y 3): alcance por cliente en el token, selector X-Client-Id, rol CLIENT,
  // administración de clientes y asignación de guardias, y cliente activo en el snapshot de sync.
  "multiclient.scope",
  "multiclient.client-header",
  "multiclient.client-role",
  "multiclient.organizations",
  "sync.snapshot.client",
  // Fase 5: el chat en vivo usa un canal de Ably por cliente (`chat:team:<clientId>`); el canal global ya no existe.
  "realtime.chat.per-client",
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
