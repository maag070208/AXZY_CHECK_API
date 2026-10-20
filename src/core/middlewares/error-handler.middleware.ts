import { Request, Response, NextFunction } from "express";
import { AppError } from "@src/core/errors/app-error";
import { createTResult } from "@src/core/mappers/tresult.mapper";

/**
 * Manejador global de errores (E-19).
 * - AppError: se responde su status y su mensaje (son para el usuario).
 * - Errores 4xx de terceros (p. ej. JSON mal formado, body muy grande): se
 *   responde su status y su mensaje, que ya son seguros.
 * - Cualquier otro error (500): se registra en el servidor y el cliente solo
 *   recibe un mensaje genérico, nunca el mensaje ni el stack internos.
 */
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ ...createTResult(null, [err.message]), code: err.code });
  }

  const status: number = typeof err?.status === "number" ? err.status : 500;
  if (status < 500) {
    return res.status(status).json(createTResult(null, [err?.message ?? "Solicitud inválida"]));
  }

  console.error("[error]", err);
  return res.status(500).json(createTResult(null, ["Error interno del servidor"]));
};
