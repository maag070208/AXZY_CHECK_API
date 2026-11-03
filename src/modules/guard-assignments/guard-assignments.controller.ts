import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { createGuardAssignment, endGuardAssignment, getGuardAssignment, listGuardAssignments } from "./guard-assignments.service";

export const list = async (req: Request, res: Response) => {
  try {
    const { clientId, guardId, active } = req.query as Record<string, string | undefined>;
    const result = await listGuardAssignments(req.scope, {
      ...(clientId ? { clientId: Number(clientId) } : {}),
      ...(guardId ? { guardId: Number(guardId) } : {}),
      ...(active !== undefined ? { active: active === "true" } : {}),
    });
    return res.status(200).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const result = await createGuardAssignment(req.scope, {
      guardId: Number(req.body.guardId),
      clientId: Number(req.body.clientId),
      ...(req.body.startsAt ? { startsAt: new Date(String(req.body.startsAt)) } : {}),
    });
    return res.status(201).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const end = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await endGuardAssignment(req.scope, Number(req.params.id))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const get = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await getGuardAssignment(req.scope, Number(req.params.id))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
