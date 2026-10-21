import { NextFunction, Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";

/**
 * Postgres no acepta el carácter NUL (\u0000) en un texto: la consulta falla y el cliente veía un
 * 500. Ningún campo legítimo lo lleva, así que se rechaza de entrada con un 400.
 */
export const rejectNullBytes = (req: Request, res: Response, next: NextFunction) => {
  const hasNull = (value: unknown) => {
    if (value === undefined || value === null) return false;
    return JSON.stringify(value).includes("\\u0000");
  };
  if (hasNull(req.query) || hasNull(req.body) || req.originalUrl.includes("%00")) {
    return res.status(400).json({ ...createTResult(null, ["La solicitud contiene caracteres no válidos"]), code: "INVALID_CHARACTERS" });
  }
  return next();
};
