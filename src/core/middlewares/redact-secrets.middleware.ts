import { Request, Response, NextFunction } from "express";

/**
 * Claves que nunca deben salir en una respuesta HTTP.
 * Red de seguridad (defensa en profundidad): aunque una consulta traiga el hash
 * por error, no llega al cliente.
 */
const SECRET_KEYS = new Set(["password"]);

/**
 * Copia profunda sin las claves secretas. Corta solo los ciclos reales: `ancestors` guarda
 * la rama actual, no todo lo visto, así un mismo objeto compartido sale completo en cada lugar.
 */
export const redactSecrets = <T>(value: T, ancestors = new Set<object>()): T => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (ancestors.has(value as object)) return undefined as unknown as T;

  ancestors.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactSecrets(item, ancestors)) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key)) continue;
      out[key] = redactSecrets(item, ancestors);
    }
    return out as T;
  } finally {
    ancestors.delete(value as object);
  }
};

/** Envuelve res.json para que todo cuerpo pase por `redactSecrets`. */
export const redactResponseSecrets = (_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown) => originalJson(redactSecrets(body));
  next();
};
