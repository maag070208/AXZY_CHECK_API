import { Request, Response, NextFunction } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";

/**
 * @description Express middleware factory that restricts a route to a set of
 * user roles. Must run after `authenticate` (it relies on `req.user.role`,
 * the role name embedded in the JWT at login, e.g. "ADMIN", "SHIFT").
 * @param allowedRoles Role names allowed to access the route.
 * @returns Express middleware; responds 403 (TResult) if the role doesn't match.
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore - req.user is attached by the `authenticate` middleware
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res
        .status(403)
        .json(createTResult(null, ["No tienes permisos para realizar esta acción"]));
    }
    next();
  };
};
