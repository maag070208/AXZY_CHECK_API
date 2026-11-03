import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { getAllRecurringConfigurations, createRecurringConfiguration, deleteRecurringConfiguration, toggleRecurringConfiguration, assignConfigurationToGuards, getRecurringConfigurationsForUser, updateRecurringConfiguration, getDataTableRecurring } from "./recurring.service";
import { respondError } from "@src/core/errors/http-error";

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await getDataTableRecurring(req.body, req.scope);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const getRecurringList = async (req: Request, res: Response) => {
  try {
    const list = await getAllRecurringConfigurations(req.scope);
    return res.status(200).json(createTResult(list));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const createRecurring = async (req: Request, res: Response) => {
  try {
    const { title, locations, guardIds } = req.body;
    
    // locations should be: { locationId: number, tasks: { description: string, reqPhoto: boolean }[] }[]
    if (!title || !locations || !Array.isArray(locations)) {
        return res.status(400).json(createTResult(null, ["Invalid payload"]));
    }

    const created = await createRecurringConfiguration(title, locations, guardIds, req.scope);
    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    console.log(error);
    return respondError(res, error);
  }
};

export const toggleRecurring = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { active } = req.body;
        const updated = await toggleRecurringConfiguration(Number(id), active, req.scope);
        return res.status(200).json(createTResult(updated));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const updateRecurring = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, locations, guardIds } = req.body;
        
        if (!title || !locations || !Array.isArray(locations)) {
             return res.status(400).json(createTResult(null, ["Invalid payload"]));
        }

        const updated = await updateRecurringConfiguration(Number(id), title, locations, guardIds, req.scope);
        return res.status(200).json(createTResult(updated));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const deleteRecurring = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await deleteRecurringConfiguration(Number(id), req.scope);
        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const assignGuard = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { guardIds } = req.body;
        
        if (!guardIds || !Array.isArray(guardIds)) {
             return res.status(400).json(createTResult(null, ["Invalid payload"]));
        }

        const updated = await assignConfigurationToGuards(Number(id), guardIds, req.scope);
        return res.status(200).json(createTResult(updated));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const getMyRecurring = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const list = await getRecurringConfigurationsForUser(userId, req.scope);
        return res.status(200).json(createTResult(list));
    } catch (error: any) {
        return respondError(res, error);
    }
}
