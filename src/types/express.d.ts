/**
 * Identidad del usuario autenticado. La agrega `authenticate` a partir del token JWT
 * (payload de POST /users/login). Nunca viene del cuerpo de la petición.
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
    }
  }
}

export {};
