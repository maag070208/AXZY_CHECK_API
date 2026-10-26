import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import {
  createAnnouncement,
  listAnnouncements,
  listMyNotifications,
  markNotificationRead,
  unreadNotificationCount,
} from "./announcements.service";

const userId = (req: Request) => Number(req.user?.id);

export const list = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listAnnouncements(req.query as any)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(createTResult(await createAnnouncement(req.body, userId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const myNotifications = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listMyNotifications(userId(req), req.query as any)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const myUnreadCount = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult({ count: await unreadNotificationCount(userId(req)) }));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const read = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await markNotificationRead(userId(req), Number(req.params.id))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
