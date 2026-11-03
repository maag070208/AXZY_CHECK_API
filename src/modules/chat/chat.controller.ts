import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { chatTeamChannel, publishToChannel } from "@src/core/config/ably";
import * as chatService from "./chat.service";
import { respondError } from "@src/core/errors/http-error";

/**
 * @description GET /chat/messages?cursor=&limit= — paginated message history,
 * newest first.
 */
export const getMessages = async (req: Request, res: Response) => {
  try {
    const { cursor, limit } = req.query;
    const cursorId = cursor ? Number(cursor) : undefined;
    if (cursorId !== undefined && !Number.isInteger(cursorId)) {
      return res.status(400).json(createTResult(null, ["El cursor no es válido"]));
    }
    const messages = await chatService.getMessages(req.scope, cursorId, limit ? Number(limit) : undefined);
    return res.status(200).json(createTResult(messages));
  } catch (error: any) {
    return respondError(res, error);
  }
};

/**
 * @description POST /chat/messages — creates a message from the authenticated
 * user and publishes it to Ably for live delivery (best-effort).
 */
export const createMessage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { message } = req.body;

    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      return res.status(400).json(createTResult(null, ["El mensaje no puede estar vacío"]));
    }

    const created = await chatService.createMessage(req.scope, Number(userId), trimmed);
    const { clientId, ...published } = created;

    // Fire-and-forget: a failed realtime push must never fail the request —
    // the message is already persisted and will show up on next poll/refresh.
    // El canal es el del cliente del mensaje: el chat en vivo ya no se comparte entre clientes.
    void publishToChannel(chatTeamChannel(clientId), "new-message", published);

    return res.status(201).json(createTResult(published));
  } catch (error: any) {
    return respondError(res, error);
  }
};
