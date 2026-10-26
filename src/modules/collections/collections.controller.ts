import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import {
  applyLateFees,
  generateCollectionCharges,
  listCollectionConfigs,
  updateCollectionConfig,
  upsertCollectionConfig,
} from "./collections.service";

const actorId = (req: Request) => Number((req.user as { id?: number } | undefined)?.id);

export const getCollectionConfigs = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listCollectionConfigs()));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const postCollectionConfig = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(createTResult(await upsertCollectionConfig(req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const putCollectionConfig = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await updateCollectionConfig(Number(req.params.id), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const postGenerateCharges = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await generateCollectionCharges(actorId(req), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const postApplyLateFees = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await applyLateFees(actorId(req), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
