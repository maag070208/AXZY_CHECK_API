import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { createTResult } from "@src/core/mappers/tresult.mapper";

type Schemas = { params?: ZodType; query?: ZodType; body?: ZodType };
type Part = keyof Schemas;

/**
 * Valida params, query y body con Zod (T-F0-03). Si algo no cumple, responde 400
 * con la lista de campos y un código de validación. Si todo cumple, reemplaza
 * la parte validada por el valor ya parseado (tipos y valores por defecto).
 */
export const validate = (schemas: Schemas) => {
  const middleware = (req: Request, res: Response, next: NextFunction) => {
  const issues: { path: string; message: string }[] = [];
  const parts: Part[] = ["params", "query", "body"];

  for (const part of parts) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse((req as any)[part]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ path: [part, ...issue.path.map(String)].join("."), message: issue.message });
      }
    } else {
      (req as any)[part] = result.data;
    }
  }

  if (issues.length > 0) {
    return res.status(400).json({
      ...createTResult(null, issues.map((i) => `${i.path}: ${i.message}`)),
      code: "VALIDATION_ERROR",
      issues,
    });
  }
  return next();
  };
  // Marca para el inventario de rutas: prueba que toda escritura valida su entrada.
  return Object.assign(middleware, { validates: true as const });
};
