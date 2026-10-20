import { NextFunction, Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { changeOccupancy, changeOwnership, getOccupancy } from "./occupancy.service";

// La identidad viene del token (req.user lo agrega authenticate).
const actorId = (req: Request): number => (req as any).user.id;

export const getPropertyOccupancy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await getOccupancy(Number(req.params.id))));
  } catch (error) {
    return next(error);
  }
};

export const postPropertyOccupancy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await changeOccupancy(
      Number(req.params.id),
      {
        status: req.body.status,
        tenantPersonId: req.body.tenantPersonId || null,
        ownerPersonId: req.body.ownerPersonId || null,
        releaseResidents: req.body.releaseResidents,
        notes: req.body.notes ?? null,
      },
      actorId(req),
    );
    return res.status(201).json(createTResult(result));
  } catch (error) {
    return next(error);
  }
};

export const postPropertyOwnership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const change = await changeOwnership(
      Number(req.params.id),
      { toPersonId: req.body.toPersonId, notes: req.body.notes ?? null },
      actorId(req),
    );
    return res.status(201).json(createTResult(change));
  } catch (error) {
    return next(error);
  }
};
