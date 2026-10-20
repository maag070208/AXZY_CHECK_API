import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "@src/core/logger/logger";

/**
 * Asigna un requestId a cada petición (o reutiliza X-Request-Id si el cliente
 * lo envía), lo devuelve en la respuesta y registra el resultado sin datos
 * del cuerpo (T-F0-02).
 */
export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header("x-request-id");
  const requestId = incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming) ? incoming : randomUUID();
  (req as any).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const started = Date.now();
  res.on("finish", () => {
    logger.info(
      { requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started },
      "request",
    );
  });
  next();
};
