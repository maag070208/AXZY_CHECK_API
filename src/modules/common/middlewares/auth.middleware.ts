
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../../core/utils/security';
import { createTResult } from '../../../core/mappers/tresult.mapper';
import { prismaClient } from '../../../core/config/database';
import { readCookie, SESSION_COOKIE } from '../../../core/utils/auth-cookies';
import { CLIENT_HEADER, resolveClientScope, ScopeSource } from '../../../core/scope/client-scope';

type SessionState = {
    tokenVersion: number;
    active: boolean;
    scope: Omit<ScopeSource, 'role'>;
    expiresAt: number;
};
const sessionCache = new Map<number, SessionState>();
// Caché corto para no consultar la base en cada petición; la revocación surte efecto en pocos segundos.
const SESSION_CACHE_MS = process.env.NODE_ENV === 'test' ? 0 : Number(process.env.SESSION_CACHE_MS ?? 5000);

/** Olvida el estado de sesión de un usuario (tras revocar o desactivar, o al cambiar su asignación de cliente). */
export const invalidateSession = (userId: number) => {
    sessionCache.delete(userId);
};

const loadSession = async (userId: number): Promise<SessionState | null> => {
    const cached = sessionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached;
    const row = await prismaClient.user.findUnique({
        where: { id: userId },
        select: {
            tokenVersion: true,
            active: true,
            organizationId: true,
            organization: { select: { active: true, clients: { where: { active: true }, select: { id: true } } } },
            guardAssignments: {
                where: { endsAt: null, startsAt: { lte: new Date() }, client: { active: true } },
                select: { client: { select: { id: true, organizationId: true } } },
                take: 1,
            },
            property: { select: { client: { select: { id: true, organizationId: true, active: true } } } },
            // Rol CLIENT: el cliente al que pertenece el usuario administrador del cliente.
            client: { select: { id: true, organizationId: true, active: true } },
        },
    });
    if (!row) {
        sessionCache.delete(userId);
        return null;
    }
    // Multicliente: solo cuentan la organización activa del usuario y clientes de esa organización.
    const organizationId = row.organization?.active ? row.organizationId : null;
    const assigned = row.guardAssignments[0]?.client;
    const propertyClient = row.property?.client;
    const userClient = row.client;
    const state: SessionState = {
        tokenVersion: row.tokenVersion,
        active: row.active,
        scope: {
            organizationId,
            assignedClientId: organizationId !== null && assigned?.organizationId === organizationId ? assigned.id : null,
            propertyClientId:
                organizationId !== null && propertyClient?.active && propertyClient.organizationId === organizationId
                    ? propertyClient.id
                    : null,
            userClientId:
                organizationId !== null && userClient?.active && userClient.organizationId === organizationId
                    ? userClient.id
                    : null,
            organizationClientIds: organizationId !== null ? row.organization!.clients.map((c) => c.id) : [],
        },
        expiresAt: Date.now() + SESSION_CACHE_MS,
    };
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

        // Multicliente: el alcance sale de la sesión; X-Client-Id solo elige entre los clientes permitidos.
        const scope = resolveClientScope({ ...session.scope, role: String(decoded.role) }, req.header(CLIENT_HEADER));
        if (!scope.ok) {
            return res.status(scope.status).json(createTResult(null, [scope.message]));
        }

        req.user = decoded as NonNullable<Request["user"]>;
        req.scope = scope.scope;
        next();
    } catch (error) {
        return res.status(401).json(createTResult(null, ['Invalid or expired token']));
    }
};
