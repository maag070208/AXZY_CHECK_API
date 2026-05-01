import { Request, Response } from 'express';
import * as roundService from './round.service';
import { createTResult } from "@src/core/mappers/tresult.mapper";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await roundService.getDataTableRounds(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const startRound = async (req: Request, res: Response) => {
  const { guardId, recurringConfigId } = req.body;
  // If coming from middleware, we might use req.user.id, but let's support body for flexibility or confirm middleware usage later.
  // Assuming req.user exists if authenticated.
  const userId = (req as any).user?.id || guardId;

  const configId = recurringConfigId ? Number(recurringConfigId) : undefined;

  const result = await roundService.startRound(Number(userId), configId);
  return res.status(result.success ? 200 : 400).json(result);
};

export const endRound = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await roundService.endRound(Number(id));
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
