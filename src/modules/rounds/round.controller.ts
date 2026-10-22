import { Request, Response } from 'express';
import * as roundService from './round.service';
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { getClientRef, getOccurredAt, getOfflineOrigin } from "@src/core/utils/idempotency";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await roundService.getDataTableRounds(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const startRound = async (req: Request, res: Response) => {
  const { recurringConfigId } = req.body;
  const clientRef = getClientRef(req);
  const startedAt = getOccurredAt(req, "startedAt");
  const origin = getOfflineOrigin(req);
  // La identidad viene del token (la ruta exige autenticación): nunca del body.
  const userId = (req as any).user.id;

  const configId = recurringConfigId ? Number(recurringConfigId) : undefined;

  const result = await roundService.startRound(Number(userId), configId, { clientRef, startedAt, ...origin });
  return res.status(result.success ? 200 : 400).json(result);
};

export const endRound = async (req: Request, res: Response) => {
  const { id } = req.params;
  const actor = req.user as { id: number; role: string };
  const endedAt = getOccurredAt(req, "endedAt");
  const idempotent = !!getClientRef(req) || !!endedAt;
  const result = await roundService.endRound(Number(id), actor, endedAt, idempotent);
  if (!result.success && (result as any).code === "FORBIDDEN") {
    return res.status(403).json(result);
  }
  return res.status(result.success ? 200 : 400).json(result);
};

export const getCurrentRound = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
      return res.status(401).json({ success: false, message: 'No autorizado' });
  }
  const result = await roundService.getCurrentRound(Number(userId));
  return res.status(result.success ? 200 : 400).json(result);
};

export const getRounds = async (req: Request, res: Response) => {
    // Optional filters like date, or guardId
    const { date, guardId } = req.query;
    const result = await roundService.getRounds(
        date ? String(date) : undefined, 
        guardId ? Number(guardId) : undefined
    );
    return res.status(result.success ? 200 : 500).json(result);
};

export const getRoundDetail = async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await roundService.getRoundDetail(Number(id));
    return res.status(result.success ? 200 : 404).json(result);
};
