/**
 * @description Constantes del módulo de Novedades en tiempo real.
 * Define el canal y evento de Ably, así como los roles autorizados
 * para leer y publicar novedades.
 */

/** @description Nombre del canal de Ably donde se difunden las novedades. */
export const NOVEDADES_CHANNEL = "novedades";

/** @description Nombre del evento publicado en el canal de Ably. */
export const NOVEDADES_EVENT = "novedad";

/**
 * @description Roles autorizados para leer y publicar novedades.
 * RESDN (residentes) queda excluido del chat de operaciones.
 */
export const NOVEDADES_ROLES = ["ADMIN", "LIDER", "GUARD", "SHIFT", "MAINT"] as const;

/** @description Longitud máxima permitida del mensaje de una novedad. */
export const NOVEDADES_MESSAGE_MAX = 2000;

/** @description TTL (en ms) del token de Ably emitido a los clientes. */
export const NOVEDADES_TOKEN_TTL_MS = 60 * 60 * 1000;
