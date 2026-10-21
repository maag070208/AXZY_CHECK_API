import { Request, Response, NextFunction } from "express";
import { respondError } from "@src/core/errors/http-error";

/**
 * Manejador global de errores (E-19). La traducción (AppError, Prisma, errores 4xx de
 * terceros y 500 genérico sin filtrar mensajes internos) vive en `core/errors/http-error.ts`
 * y la comparten los controladores que responden sus propios errores.
 */
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => respondError(res, err);
