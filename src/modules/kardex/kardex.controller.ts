import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { createKardex, getKardex, getKardexById, updateKardex } from "./kardex.service";

export const createKardexEntry = async (req: Request, res: Response) => {
  try {
    const { userId, locationId, notes, media, latitude, longitude } = req.body;

    if (!userId || !locationId) {
      return res.status(400).json(createTResult(null, ["userId and locationId are required"]));
    }

    const entry = await createKardex({
      userId: Number(userId),
      locationId: Number(locationId),
      notes,
      media,
      latitude,
      longitude,
    });

    return res.status(201).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const updateKardexEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, media, latitude, longitude } = req.body;

    const entry = await updateKardex(Number(id), {
      notes,
      media,
      latitude,
      longitude,
    });

    return res.status(200).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getKardexEntries = async (req: Request, res: Response) => {
  try {
    const { userId, locationId, startDate, endDate } = req.query;

    const entries = await getKardex({
      userId: userId ? Number(userId) : undefined,
      locationId: locationId ? Number(locationId) : undefined,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    return res.status(200).json(createTResult(entries));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getKardexDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await getKardexById(Number(id));

    if (!entry) {
      return res.status(404).json(createTResult(null, ["Kardex entry not found"]));
    }

    return res.status(200).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
