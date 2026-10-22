import { Request } from "express";

/**
 * Clave idempotente de una operación offline.
 * Acepta `clientRef` en el body y, como fallback, el header estándar.
 * El cliente debe mantener la misma clave en todos los reintentos.
 */
export const getClientRef = (req: Request): string | undefined => {
  const bodyRef = req.body?.clientRef;
  const headerRef = req.header("Idempotency-Key");
  const value = typeof bodyRef === "string" && bodyRef.trim()
    ? bodyRef.trim()
    : typeof headerRef === "string" && headerRef.trim()
      ? headerRef.trim()
      : undefined;
  return value ? value.slice(0, 100) : undefined;
};

/** Timestamp enviado por el cliente (ISO), si es válido. */
export const getOccurredAt = (req: Request, field = "createdAt"): Date | undefined => {
  const raw = req.body?.[field];
  if (!raw) return undefined;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return undefined;
  // Evita fechas absurdas fuera de ±24 h; el servidor conserva su hora de recepción.
  const diff = Math.abs(Date.now() - date.getTime());
  return diff <= 24 * 60 * 60 * 1000 ? date : undefined;
};
