import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { createExit, getAllExits } from "./exits.service";

export const getExits = async (req: Request, res: Response) => {
  try {
    const exits = await getAllExits();
    return res.status(200).json(createTResult(exits));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const addExit = async (req: Request, res: Response) => {
  try {
    const { entryId, operatorUserId, notes } = req.body;
    const exit = await createExit({
        entryId: Number(entryId),
        operatorUserId: Number(operatorUserId),
        notes
    });
    return res.status(201).json(createTResult(exit));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
