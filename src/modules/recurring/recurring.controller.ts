import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { getAllRecurringConfigurations, createRecurringConfiguration, deleteRecurringConfiguration, toggleRecurringConfiguration, getRecurringConfigById, assignConfigurationToGuards, getRecurringConfigurationsForUser, updateRecurringConfiguration, getDataTableRecurring } from "./recurring.service";

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await getDataTableRecurring(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getRecurringList = async (req: Request, res: Response) => {
  try {
    const list = await getAllRecurringConfigurations();
    return res.status(200).json(createTResult(list));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const createRecurring = async (req: Request, res: Response) => {
  try {
    const { title, locations, guardIds } = req.body;
    
    // locations should be: { locationId: number, tasks: { description: string, reqPhoto: boolean }[] }[]
    if (!title || !locations || !Array.isArray(locations)) {
        return res.status(400).json(createTResult(null, ["Invalid payload"]));
    }

    const created = await createRecurringConfiguration(title, locations, guardIds);
    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    console.log(error);
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const toggleRecurring = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { active } = req.body;
        const updated = await toggleRecurringConfiguration(Number(id), active);
        return res.status(200).json(createTResult(updated));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const updateRecurring = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, locations, guardIds } = req.body;
        
        if (!title || !locations || !Array.isArray(locations)) {
             return res.status(400).json(createTResult(null, ["Invalid payload"]));
        }

        const updated = await updateRecurringConfiguration(Number(id), title, locations, guardIds);
        return res.status(200).json(createTResult(updated));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const deleteRecurring = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await deleteRecurringConfiguration(Number(id));
        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const assignGuard = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { guardIds } = req.body;
        
        if (!guardIds || !Array.isArray(guardIds)) {
             return res.status(400).json(createTResult(null, ["Invalid payload"]));
        }

        const updated = await assignConfigurationToGuards(Number(id), guardIds);
        return res.status(200).json(createTResult(updated));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getMyRecurring = async (req: Request, res: Response) => {
    try {
        const userId = res.locals.user.id;
        console.log("DEBUG: getMyRecurring - userId:", userId, "Type:", typeof userId);
        const list = await getRecurringConfigurationsForUser(userId);
        console.log("DEBUG: getMyRecurring - found configs:", list.length);
        return res.status(200).json(createTResult(list));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
}
