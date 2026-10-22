import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { getGuardSyncSnapshot } from "./sync.service";

export const pull = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    const snapshot = await getGuardSyncSnapshot(userId);
    return res.status(200).json(createTResult(snapshot));
  } catch (error) {
    return respondError(res, error);
  }
};
