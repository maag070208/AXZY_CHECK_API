import { Request, Response, NextFunction } from "express";
import { isPublicRoute } from "@src/core/routes/public";
import { authenticate } from "./auth.middleware";

/**
 * @description Guard global del API: exige token en TODA ruta que no esté en
 * la lista blanca `PUBLIC_ROUTES`. Falla cerrado: una ruta nueva sin declarar
 * queda protegida por defecto.
 */
export const requireAuthUnlessPublic = (req: Request, res: Response, next: NextFunction) => {
  if (isPublicRoute(req.method, req.path)) {
    return next();
  }
  return authenticate(req, res, next);
};
