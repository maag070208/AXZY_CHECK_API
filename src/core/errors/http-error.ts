import { Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "@src/core/errors/app-error";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { logger } from "@src/core/logger/logger";

export interface HttpError {
  status: number;
  messages: string[];
  code?: string;
}

/**
 * Traduce cualquier error a una respuesta HTTP segura (E-19).
 * - AppError: su status, mensaje y código (son para el usuario).
 * - Prisma, errores del cliente: registro inexistente → 404, duplicado → 409, referencia a un
 *   registro que no existe → 400, dato mal formado o filtro desconocido → 400. Nunca se
 *   devuelve el mensaje interno de Prisma (trae nombres de tablas y consultas).
 * - Errores 4xx de terceros (JSON mal formado, body muy grande): su status y mensaje.
 * - Cualquier otro: 500 con mensaje genérico; el detalle solo va al log del servidor.
 */
export const mapError = (err: any, requestId?: string): HttpError => {
  if (err instanceof AppError) return { status: err.status, messages: [err.message], code: err.code };

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025":
        return { status: 404, messages: ["Registro no encontrado"], code: "NOT_FOUND" };
      case "P2002":
        return { status: 409, messages: ["Ya existe un registro con esos datos"], code: "DUPLICATE" };
      case "P2003":
        return { status: 400, messages: ["Hace referencia a un registro que no existe o que está en uso"], code: "INVALID_REFERENCE" };
      case "P2000":
      case "P2006":
      case "P2007":
      case "P2011":
      case "P2012":
      case "P2020":
        return { status: 400, messages: ["Algún dato no es válido"], code: "INVALID_DATA" };
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, messages: ["Algún dato o filtro no es válido"], code: "INVALID_DATA" };
  }

  // multer: archivo demasiado grande → 413; cualquier otro fallo de la subida es del cliente → 400.
  if (err?.name === "MulterError") {
    return err.code === "LIMIT_FILE_SIZE"
      ? { status: 413, messages: ["El archivo es demasiado grande"], code: "FILE_TOO_LARGE" }
      : { status: 400, messages: ["La subida del archivo no es válida"], code: "UPLOAD_INVALID" };
  }

  const status: number = typeof err?.status === "number" ? err.status : 500;
  if (status < 500) return { status, messages: [err?.message ?? "Solicitud inválida"] };

  logger.error({ err: { name: err?.name, message: err?.message }, requestId }, "error no controlado");
  return { status: 500, messages: ["Error interno del servidor"] };
};

/** Responde un error con el formato estándar (TResult) usando `mapError`. */
export const respondError = (res: Response, err: unknown): Response => {
  const { status, messages, code } = mapError(err, (res.req as any)?.requestId);
  return res.status(status).json(code ? { ...createTResult(null, messages), code } : createTResult(null, messages));
};
