import { prismaClient } from "@src/core/config/database";

/**
 * Ejecuta `fn` solo si esta instancia obtiene el candado de Postgres `key`.
 * Con varias réplicas del API, solo una emite el trabajo programado (E-13).
 * El candado es transaccional: se libera al terminar `fn`.
 * @returns true si se ejecutó en esta instancia, false si otra la tiene.
 */
export const withAdvisoryLock = async (key: number, fn: () => Promise<void>): Promise<boolean> => {
  return prismaClient.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${key}) AS ok`;
      if (!rows[0]?.ok) return false;
      await fn();
      return true;
    },
    { timeout: 120_000 },
  );
};

/** Claves de candado del sistema (un número por trabajo programado). */
export const LOCK_KEYS = {
  SHIFT_ALERT_MORNING: 710001,
  SHIFT_ALERT_EVENING: 710002,
  INVITATION_EXPIRY: 710003,
} as const;
