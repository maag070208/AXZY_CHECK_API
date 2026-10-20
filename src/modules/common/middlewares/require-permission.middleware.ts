import { Request, Response, NextFunction } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { PermissionCode } from "@src/core/permissions/permission-matrix";
import { roleHasPermission } from "@src/core/permissions/permissions.service";

const FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción";

/**
 * @description Permite la petición si el rol del usuario autenticado tiene el
 * permiso `code`. Debe ejecutarse después de `authenticate` (usa `req.user`).
 * Responde 403 (TResult) si no lo tiene.
 */
export const requirePermission = (code: PermissionCode) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role: string | undefined = req.user?.role;
      if (!role || !(await roleHasPermission(role, code))) {
        return res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/**
 * @description Permite la petición si el usuario es el dueño del recurso
 * (`req.params[param]`) o si su rol tiene el permiso `code`.
 * Debe ejecutarse después de `authenticate`.
 */
export const selfOrPermission = (code: PermissionCode, param = "id") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as { id: number; role: string } | undefined;
      if (!user) {
        return res.status(401).json(createTResult(null, ["No token provided"]));
      }
      if (Number(req.params[param]) === Number(user.id)) {
        return next();
      }
      if (await roleHasPermission(user.role, code)) {
        return next();
      }
      return res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
    } catch (error) {
      return next(error);
    }
  };
};
