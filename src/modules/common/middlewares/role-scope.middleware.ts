import { NextFunction, Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";

const FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción";

/** Personal operativo y administrativo. El residente (RESDN) no forma parte. */
export const STAFF_ROLES: ReadonlyArray<string> = ["ADMIN", "SHIFT", "GUARD", "MAINT"];

export const isStaff = (role: string | undefined): boolean => role !== undefined && STAFF_ROLES.includes(role);

/**
 * Solo personal: las pantallas operativas (rondas, bitácora, incidencias, ubicaciones, horarios…)
 * no las usa el residente, y varias de sus rutas de lectura solo exigen sesión. Debe ir después de
 * `authenticate`.
 */
export const requireStaff = (req: Request, res: Response, next: NextFunction) => {
  if (!isStaff(req.user?.role)) {
    return res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
  }
  return next();
};

/**
 * El personal pasa; el residente solo accede a SU propio registro (`req.params[param]` = su id).
 * Evita que un residente lea el perfil o los contactos de sus vecinos.
 */
export const selfOrStaff = (param = "id") => (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as { id: number; role: string } | undefined;
  if (isStaff(user?.role) || (user && Number(req.params[param]) === Number(user.id))) {
    return next();
  }
  return res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
};
