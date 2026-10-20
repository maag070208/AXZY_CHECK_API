import { NextFunction, Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { addHouseholdResident, listHousehold, moveOut, setPrimary } from "./household.service";

export const getHousehold = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await listHousehold(Number(req.params.id))));
  } catch (error) {
    return next(error);
  }
};

export const postHouseholdResident = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resident = await addHouseholdResident(Number(req.params.id), {
      ...req.body,
      personId: req.body.personId || null,
    });
    return res.status(201).json(createTResult(resident));
  } catch (error) {
    return next(error);
  }
};

export const postSetPrimary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await setPrimary(Number(req.params.id))));
  } catch (error) {
    return next(error);
  }
};

export const postMoveOut = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await moveOut(Number(req.params.id), { replacementPrimaryId: req.body.replacementPrimaryId || null });
    return res.status(200).json(createTResult(result));
  } catch (error) {
    return next(error);
  }
};
