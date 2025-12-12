import { Request, Response } from "express";
import {
  get,
  getById,
  create,
  update,
  remove,
} from "./trainingMode.service";
import { createTResult } from "@src/core/mappers/tresult.mapper";

export const getAllTrainingModes = async (req: Request, res: Response) => {
  try {
    const modes = await get();
    return res.status(200).json(createTResult(modes));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getTrainingModeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mode = await getById(Number(id));
    return res.status(200).json(createTResult(mode));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const createTrainingMode = async (req: Request, res: Response) => {
  try {
    const created = await create(req.body);
    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const updateTrainingMode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await update(Number(id), req.body);
    return res.status(200).json(createTResult(updated));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const deleteTrainingMode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await remove(Number(id));
    return res.status(200).json(createTResult(deleted));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
