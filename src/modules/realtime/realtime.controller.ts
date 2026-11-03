import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { createSubscribeTokenRequest } from "@src/core/config/ably";
import { prismaClient } from "@src/core/config/database";
import { ClientScope } from "@src/core/scope/client-scope";
import { respondError } from "@src/core/errors/http-error";

/** Roles de organización: eligen cliente con `X-Client-Id`, así que pueden escuchar el chat de todos sus clientes. */
const ORGANIZATION_ROLES = ["ADMIN", "MAINT"];

/**
 * Clientes cuyo chat puede escuchar la sesión. El alcance sale del token/sesión (`req.scope`), nunca de la
 * petición: ADMIN/MAINT reciben todos los clientes activos de su organización; los roles con cliente fijo, el
 * suyo. Sin organización no hay canales internos.
 */
const realtimeClientIds = async (scope: ClientScope | undefined, role: string | undefined): Promise<number[]> => {
  if (!scope?.organizationId) return [];
  if (role && ORGANIZATION_ROLES.includes(role)) {
    const clients = await prismaClient.client.findMany({
      where: { organizationId: scope.organizationId, active: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return clients.map((client) => client.id);
  }
  return scope.clientId !== null ? [scope.clientId] : [];
};

/**
 * @description Issues a subscribe-only Ably TokenRequest for the authenticated
 * user so WEB/APP clients can connect to realtime channels (chat, shift
 * alerts) without ever holding the raw ABLY_KEY. If Ably is not configured,
 * responds 503 so the client can silently fall back to polling.
 * @param req Express request (requires `authenticate` middleware).
 * @param res TResult<Ably.TokenRequest>
 */
export const getRealtimeToken = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const clientIds = await realtimeClientIds(req.scope, req.user?.role);
    const tokenRequest = await createSubscribeTokenRequest(`user-${userId}`, req.user?.role, Number(userId), clientIds);
    if (!tokenRequest) {
      return res
        .status(503)
        .json(createTResult(null, ["El servicio de tiempo real no está disponible"]));
    }

    return res.status(200).json(createTResult(tokenRequest));
  } catch (error: any) {
    return respondError(res, error);
  }
};
