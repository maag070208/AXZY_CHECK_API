/**
 * @description Constantes del módulo de notificaciones.
 */
export const NOTIFICATIONS_CHANNEL_PREFIX = "notifications";
export const NOTIFICATIONS_EVENT_SHIFT_INCIDENT = "shift.incident";

/**
 * @description Construye el nombre del canal Ably para un usuario.
 */
export const notificationsChannel = (userId: number): string =>
    `${NOTIFICATIONS_CHANNEL_PREFIX}.${userId}`;
