import { Request, Response } from "express";
import { createTResult } from "../../core/mappers/tresult.mapper";
import { createExtraCost, getExtraCostsByEntry } from "./extra-costs.service";

export const addExtraCost = async (req: Request, res: Response) => {
  try {
    const { entryId, userId, operatorId, reason, amount, imageUrl } = req.body;
    
    // Convert IDs to numbers if they come as strings
    const result = await createExtraCost({
        entryId: Number(entryId),
        userId: Number(userId),
        operatorId: Number(operatorId),
        reason,
        amount: Number(amount),
        imageUrl
    });

    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getEntryExtraCosts = async (req: Request, res: Response) => {
    try {
        const { entryId } = req.params;
        const result = await getExtraCostsByEntry(Number(entryId));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
