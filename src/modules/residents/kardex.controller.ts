import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { getResidentKardex } from "./kardex.service";

export const getMyKardex = async (req: Request, res: Response) => {
  try {
    const userId = Number((req.user as { id?: number } | undefined)?.id);
    const result = await getResidentKardex(userId, req.query as any);
    return res.status(200).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
