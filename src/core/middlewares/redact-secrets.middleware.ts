import { Request, Response, NextFunction } from "express";

/**
 * Claves que nunca deben salir en una respuesta HTTP.
 * Red de seguridad (defensa en profundidad): aunque una consulta traiga el hash
 * por error, no llega al cliente.
 */
const SECRET_KEYS = new Set(["password"]);

/** Copia profunda sin las claves secretas. Protege contra ciclos. */
export const redactSecrets = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (seen.has(value as object)) return undefined as unknown as T;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = redactSecrets(item, seen);
  }
  return out as T;
};

/** Envuelve res.json para que todo cuerpo pase por `redactSecrets`. */
export const redactResponseSecrets = (_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown) => originalJson(redactSecrets(body));
  next();
};
