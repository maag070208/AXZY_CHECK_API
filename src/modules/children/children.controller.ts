import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { getByUser, create, remove, getAll, getById, update } from "./children.service";
import { create as createAppointment } from "../appointment/appointment.service";

export const getChildrenByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const children = await getByUser(Number(userId));
    return res.status(200).json(createTResult(children));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const createChild = async (req: Request, res: Response) => {
  try {
    const child = await create(req.body);
    return res.status(201).json(createTResult(child));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const deleteChild = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await remove(Number(id));
    return res.status(200).json(createTResult(deleted));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getAllChildren = async (_req: Request, res: Response) => {
  try {
    const children = await getAll();
    return res.status(200).json(createTResult(children));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getChildById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const child = await getById(Number(id));
    return res.status(200).json(createTResult(child));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const updateChild = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await update(Number(id), req.body);
    return res.status(200).json(createTResult(updated));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const assignAppointment = async (req: Request, res: Response) => {
  try {
    // Expects { userId, childId, scheduleId, modeId } in body
    const appointment = await createAppointment(req.body);
    return res.status(201).json(createTResult(appointment));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
