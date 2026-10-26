import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import {
  createAccessException,
  getDelinquencyRule,
  getGuardAccessStatus,
  exportAccessEventsCsv,
  listAccessEvents,
  listAccessExceptions,
  revokeAccessException,
  updateDelinquencyRule,
} from "./access-control.service";

const actorId = (req: Request) => Number((req.user as { id?: number } | undefined)?.id);

export const getStatus = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await getGuardAccessStatus(Number(req.query.propertyId))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const getRule = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await getDelinquencyRule()));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const putRule = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await updateDelinquencyRule(actorId(req), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const getEvents = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listAccessEvents(req.query as any)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const exportEvents = async (req: Request, res: Response) => {
  try {
    const csv = await exportAccessEventsCsv(req.query as any);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bitacora-accesos-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(csv);
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const getExceptions = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listAccessExceptions(req.query.propertyId ? Number(req.query.propertyId) : undefined)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const postException = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(createTResult(await createAccessException(actorId(req), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const deleteException = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await revokeAccessException(Number(req.params.id))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
