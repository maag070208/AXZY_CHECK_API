import { Request, Response } from "express";
import {
  get,
  getById,
  create,
  update,
  remove,
  getByDate,
  getByMode,
  getToday,
  getWeek,
  getAvailable,
} from "./daySchedule.service";
import { createTResult } from "@src/core/mappers/tresult.mapper";

export const getAllSchedules = async (req: Request, res: Response) => {
  try {
    const schedules = await get();
    return res.status(200).json(createTResult(schedules));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getScheduleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const schedule = await getById(Number(id));
    return res.status(200).json(createTResult(schedule));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const createSchedule = async (req: Request, res: Response) => {
  try {
    const created = await create(req.body);
    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const updateSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await update(Number(id), req.body);
    return res.status(200).json(createTResult(updated));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const deleteSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await remove(Number(id));
    return res.status(200).json(createTResult(deleted));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

// FILTROS
export const getSchedulesByDate = async (req: Request, res: Response) => {
  try {
    const schedules = await getByDate(req.params.date);
    return res.status(200).json(createTResult(schedules));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getSchedulesByMode = async (req: Request, res: Response) => {
  try {
    const schedules = await getByMode(Number(req.params.id));
    return res.status(200).json(createTResult(schedules));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getSchedulesToday = async (req: Request, res: Response) => {
  try {
    const schedules = await getToday();
    return res.status(200).json(createTResult(schedules));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getSchedulesWeek = async (req: Request, res: Response) => {
  try {
    const schedules = await getWeek();
    return res.status(200).json(createTResult(schedules));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getAvailableSchedules = async (req: Request, res: Response) => {
  try {
    const schedules = await getAvailable();
    return res.status(200).json(createTResult(schedules));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};
