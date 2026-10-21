import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { createSchedule, deleteSchedule, getDataTableSchedules, getSchedules, updateSchedule } from "./schedule.service";
import { respondError } from "@src/core/errors/http-error";

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await getDataTableSchedules(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const getAll = async (req: Request, res: Response) => {
    try {
        const data = await getSchedules();
        return res.status(200).json(createTResult(data));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const create = async (req: Request, res: Response) => {
    try {
        const { name, startTime, endTime } = req.body;
        const data = await createSchedule({ name, startTime, endTime });
        return res.status(201).json(createTResult(data));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json(createTResult(null, ['Ya existe un horario con ese nombre.']));
        }
        return respondError(res, error);
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const data = await updateSchedule(Number(id), req.body);
        return res.status(200).json(createTResult(data));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json(createTResult(null, ['Ya existe un horario con ese nombre.']));
        }
        return respondError(res, error);
    }
};

export const remove = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await deleteSchedule(Number(id));
        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json(createTResult(null, ['Este horario está asignado a uno o más guardias y no puede ser eliminado.']));
        }
        return respondError(res, error);
    }
};
