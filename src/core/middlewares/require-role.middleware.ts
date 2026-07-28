import { Request, Response, NextFunction } from 'express';
import { createTResult } from '@src/core/mappers/tresult.mapper';

/**
 * Middleware de autorización por rol.
 * @description Verifica que el rol del usuario autenticado esté dentro de la lista permitida.
 * @param roles Lista de roles permitidos (e.g. ['ADMIN']).
 * @returns Middleware Express.
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // @ts-ignore
    const userRole: string | undefined = req.user?.role;

    if (!userRole) {
      res.status(401).json(createTResult(null, ['Usuario no autenticado']));
      return;
    }

    if (!roles.includes(userRole)) {
      res.status(403).json(createTResult(null, ['No tiene permisos para realizar esta acción']));
      return;
    }

    next();
  };
};
