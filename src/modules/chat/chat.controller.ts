import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { publishToChannel, ABLY_CHANNELS } from "@src/core/config/ably";
import * as chatService from "./chat.service";

/**
 * @description GET /chat/messages?cursor=&limit= — paginated message history,
 * newest first.
 */
export const getMessages = async (req: Request, res: Response) => {
  try {
    const { cursor, limit } = req.query;
    const messages = await chatService.getMessages(
      cursor ? Number(cursor) : undefined,
      limit ? Number(limit) : undefined,
    );
    return res.status(200).json(createTResult(messages));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/**
 * @description POST /chat/messages — creates a message from the authenticated
 * user and publishes it to Ably for live delivery (best-effort).
 */
export const createMessage = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - attached by `authenticate`
    const userId = req.user?.id;
    const { message } = req.body;

    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      return res.status(400).json(createTResult(null, ["El mensaje no puede estar vacío"]));
    }

    const created = await chatService.createMessage(Number(userId), trimmed);

    // Fire-and-forget: a failed realtime push must never fail the request —
    // the message is already persisted and will show up on next poll/refresh.
    void publishToChannel(ABLY_CHANNELS.CHAT_TEAM, "new-message", created);

    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};
