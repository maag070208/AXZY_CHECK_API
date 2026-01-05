import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { createMovement, getAllMovements, getKardex } from "./movements.service";
import { generateKardexPdf } from "./movements.pdf.service";

export const getMovements = async (req: Request, res: Response) => {
  try {
    const movements = await getAllMovements();
    return res.status(200).json(createTResult(movements));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getKardexLog = async (req: Request, res: Response) => {
    try {
        const timeline = await getKardex();
        return res.status(200).json(createTResult(timeline));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const addMovement = async (req: Request, res: Response) => {
  try {
    const { entryId, toLocationId, assignedUserId } = req.body;
    const movement = await createMovement({
        entryId: Number(entryId),
        toLocationId: Number(toLocationId),
        assignedUserId: Number(assignedUserId)
    });
    return res.status(201).json(createTResult(movement));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const downloadKardexPdf = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, operatorId, userId } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json(createTResult(null,[ "startDate and endDate are required"]));
        }

        const url = await generateKardexPdf({ 
            startDate: String(startDate), 
            endDate: String(endDate),
            operatorId: operatorId ? Number(operatorId) : undefined,
            userId: userId ? Number(userId) : undefined
        });

        return res.status(200).json(createTResult({ url }));

    } catch (error: any) {
        console.error(error);
        if (!res.headersSent) {
            return res.status(500).json(createTResult(null, error.message));
        }
    }
};
