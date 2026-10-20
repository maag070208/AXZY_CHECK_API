import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";

/**
 * Ajustes del cliente (T-F0-06): reemplazan a SysConfig. Tipados y editables sin
 * desplegar. Caché en memoria con TTL de 60 s; se invalida al escribir.
 */
export const SETTING_TYPES = ["string", "int", "bool"] as const;
export type SettingType = (typeof SETTING_TYPES)[number];

const TTL_MS = 60_000;
const cache = new Map<string, { value: string | null; expiresAt: number }>();

export const clearSettingsCache = () => cache.clear();

/** Valor del ajuste, o `fallback` si no existe. Los secretos se leen igual (no se exponen por API). */
export const getSetting = async (key: string, fallback: string): Promise<string> => {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value ?? fallback;
  }
  const row = await prismaClient.appSetting.findUnique({ where: { key } });
  cache.set(key, { value: row?.value ?? null, expiresAt: now + TTL_MS });
  return row?.value ?? fallback;
};

const validateValue = (type: string, value: string) => {
  if (type === "int" && !/^-?\d+$/.test(value)) throw new AppError("SETTING_INVALID_VALUE", "El valor debe ser un entero", 400);
  if (type === "bool" && value !== "true" && value !== "false") {
    throw new AppError("SETTING_INVALID_VALUE", "El valor debe ser true o false", 400);
  }
};

/** Cambia el valor de un ajuste existente, validando su tipo, y limpia la caché. */
export const setSetting = async (key: string, value: string) => {
  const row = await prismaClient.appSetting.findUnique({ where: { key } });
  if (!row) throw new AppError("SETTING_NOT_FOUND", "Ajuste no encontrado", 404);
  validateValue(row.valueType, value);
  const updated = await prismaClient.appSetting.update({ where: { key }, data: { value } });
  cache.delete(key);
  return updated;
};

/** Lista los ajustes que no son secretos (para la pantalla de administración). */
export const listSettings = () =>
  prismaClient.appSetting.findMany({
    where: { isSecret: false },
    select: { key: true, valueType: true, value: true, group: true, description: true },
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });
