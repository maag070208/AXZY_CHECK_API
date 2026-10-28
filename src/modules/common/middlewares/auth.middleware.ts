
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../../core/utils/security';
import { createTResult } from '../../../core/mappers/tresult.mapper';
import { prismaClient } from '../../../core/config/database';
import { readCookie, SESSION_COOKIE } from '../../../core/utils/auth-cookies';

type SessionState = { tokenVersion: number; active: boolean; expiresAt: number };
const sessionCache = new Map<number, SessionState>();
// Caché corto para no consultar la base en cada petición; la revocación surte efecto en pocos segundos.
const SESSION_CACHE_MS = process.env.NODE_ENV === 'test' ? 0 : Number(process.env.SESSION_CACHE_MS ?? 5000);

/** Olvida el estado de sesión de un usuario (tras revocar o desactivar). */
export const invalidateSession = (userId: number) => {
    sessionCache.delete(userId);
};

const loadSession = async (userId: number): Promise<SessionState | null> => {
    const cached = sessionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached;
    const row = await prismaClient.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, active: true } });
    if (!row) {
        sessionCache.delete(userId);
        return null;
    }
    const state = { ...row, expiresAt: Date.now() + SESSION_CACHE_MS };
    sessionCache.set(userId, state);
    return state;
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const cookieToken = readCookie(req, SESSION_COOKIE);
        if (!authHeader && !cookieToken) {
            return res.status(401).json(createTResult(null, ['No token provided']));
        }

        const token = authHeader?.split(' ')[1] ?? readCookie(req, SESSION_COOKIE);
        if (!token) {
            return res.status(401).json(createTResult(null, ['Invalid token format']));
        }

        const decoded: any = await verifyToken(token);

        // S-26: el token debe coincidir con la versión de sesión vigente y la cuenta seguir activa.
        // Los tokens anteriores a esta versión no traen `tv`: equivalen a la versión 0.
        const session = await loadSession(Number(decoded.id));
        if (!session || !session.active || Number(decoded.tv ?? 0) !== session.tokenVersion) {
            return res.status(401).json(createTResult(null, ['Sesión no válida o revocada']));
        }

        req.user = decoded as NonNullable<Request["user"]>;
        next();
    } catch (error) {
        return res.status(401).json(createTResult(null, ['Invalid or expired token']));
    }
};
