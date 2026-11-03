import type { ClientScope } from "@src/core/scope/client-scope";

/**
 * Identidad del usuario autenticado. La agrega `authenticate` a partir del token JWT
 * (payload de POST /users/login). Nunca viene del cuerpo de la petición.
 * `scope` (multicliente) también la agrega `authenticate`: ver `core/scope/client-scope.ts`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        lastName?: string | null;
        username: string;
        role: string;
      };
      scope?: ClientScope;
    }
  }
}

export {};
