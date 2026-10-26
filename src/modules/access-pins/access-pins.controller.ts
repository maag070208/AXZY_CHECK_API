import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { generateMyAccessPin, getMyAccessPin, revokeMyAccessPin, validateAccessPin } from "./access-pins.service";

const actorId = (req: Request) => Number(req.user?.id);

export const mine = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await getMyAccessPin(actorId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const generate = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(createTResult(await generateMyAccessPin(actorId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const revoke = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await revokeMyAccessPin(actorId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const validate = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await validateAccessPin(req.body.pin, actorId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
