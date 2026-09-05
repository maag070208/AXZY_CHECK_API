import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { createSubscribeTokenRequest } from "@src/core/config/ably";

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
    // @ts-ignore - attached by `authenticate`
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const tokenRequest = await createSubscribeTokenRequest(`user-${userId}`);
    if (!tokenRequest) {
      return res
        .status(503)
        .json(createTResult(null, ["El servicio de tiempo real no está disponible"]));
    }

    return res.status(200).json(createTResult(tokenRequest));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};
