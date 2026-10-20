import { Request, Response, NextFunction } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";

/**
 * @description Permite la petición si el usuario autenticado es el dueño del
 * recurso (`req.params[param]`) o si su rol está en `allowedRoles`.
 * Debe ejecutarse después de `authenticate`.
 */
export const selfOrRole = (allowedRoles: string[], param = "id") => {
  return (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore - req.user lo agrega `authenticate`
    const user = req.user as { id: number; role: string } | undefined;
    if (!user) {
      return res.status(401).json(createTResult(null, ["No token provided"]));
    }
    const isSelf = Number(req.params[param]) === Number(user.id);
    if (isSelf || allowedRoles.includes(user.role)) {
      return next();
    }
    return res
      .status(403)
      .json(createTResult(null, ["No tienes permisos para realizar esta acción"]));
  };
};
