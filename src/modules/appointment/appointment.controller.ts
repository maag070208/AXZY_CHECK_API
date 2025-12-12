import { Request, Response } from "express";
import {
  get,
  getById,
  create,
  remove,
  getByDate,
  getBySchedule,
  getByStudent,
  getByMode,
  getByUser,
} from "./appointment.service";
import { createTResult } from "@src/core/mappers/tresult.mapper";

// ✅ GET ALL
export const getAllAppointments = async (req: Request, res: Response) => {
  try {
    const appts = await get();
    return res.status(200).json(createTResult(appts));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

// ✅ GET BY ID
export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const appt = await getById(Number(req.params.id));
    return res.status(200).json(createTResult(appt));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

// ✅ CREATE (NOW USES childId)
export const createAppointment = async (req: Request, res: Response) => {
  try {
    const created = await create(req.body);
    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    return res.status(400).json(createTResult(null, error.message));
  }
};

// ✅ DELETE
export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const deleted = await remove(Number(req.params.id));
    return res.status(200).json(createTResult(deleted));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

// ✅ FILTERS

export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const data = await getByDate(req.params.date);
    return res.status(200).json(createTResult(data));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getAppointmentsBySchedule = async (req: Request, res: Response) => {
  try {
    const data = await getBySchedule(Number(req.params.scheduleId));
    return res.status(200).json(createTResult(data));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getAppointmentsByChild = async (req: Request, res: Response) => {
  try {
    const data = await getByStudent(req.params.childName);
    return res.status(200).json(createTResult(data));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getAppointmentsByMode = async (req: Request, res: Response) => {
  try {
    const data = await getByMode(Number(req.params.modeId));
    return res.status(200).json(createTResult(data));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};

export const getAppointmentsByUser = async (req: Request, res: Response) => {
  try {
    const data = await getByUser(Number(req.params.userId));
    return res.status(200).json(createTResult(data));
  } catch (error: any) {
    return res.status(500).json(createTResult([], error.message));
  }
};
