import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import {
  approveVehicle,
  createMyVehicle,
  deactivateVehicle,
  deleteMyVehicle,
  listMyVehicles,
  listVehicles,
  lookupVehicles,
  registerVehicleAccess,
  rejectVehicle,
  updateMyVehicle,
} from "./vehicles.service";

const actorId = (req: Request) => Number(req.user?.id);

export const myVehicles = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listMyVehicles(actorId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const createMine = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(createTResult(await createMyVehicle(actorId(req), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const updateMine = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await updateMyVehicle(actorId(req), Number(req.params.id), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const deleteMine = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await deleteMyVehicle(actorId(req), Number(req.params.id))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listVehicles(req.query as any)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const approve = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await approveVehicle(Number(req.params.id), actorId(req), req.body.tagCode)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const reject = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await rejectVehicle(Number(req.params.id), req.body.notes)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const deactivate = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await deactivateVehicle(Number(req.params.id))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const lookup = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await lookupVehicles(String(req.query.q))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const access = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await registerVehicleAccess(Number(req.params.id), req.body.direction, actorId(req))));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
