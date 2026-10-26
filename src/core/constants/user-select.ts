/**
 * Campos de usuario que pueden salir en respuestas de otros recursos
 * (incidencias, rondas, mantenimientos...). Nunca incluye `password`.
 * Usar en lugar de `include: { guard: true }`, que traería la fila completa.
 */
export const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  lastName: true,
  username: true,
  photoUrl: true,
  active: true,
  roleId: true,
} as const;
