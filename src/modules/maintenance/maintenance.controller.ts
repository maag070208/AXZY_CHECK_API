import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import * as maintenanceService from "./maintenance.service";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await maintenanceService.getDataTableMaintenances(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const createMaintenance = async (req: Request, res: Response) => {
  try {
    const { title, category, description, media, latitude, longitude, categoryId, typeId } = req.body;
    // @ts-ignore
    const guardId = req.user?.id;

    if (!guardId) {
        return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }
    
    // Media is passed as an array of objects { type, url, key }
    const mediaFiles = media || [];

    const result = await maintenanceService.createMaintenance({
      guardId: Number(guardId),
      title,
      categoryId: categoryId ? Number(categoryId) : undefined,
      typeId: typeId ? Number(typeId) : undefined,
      category,
      description,
      media: mediaFiles.length > 0 ? mediaFiles : undefined,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
    });

    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getMaintenances = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, guardId, category, title } = req.query;

        const filters: any = {};
        if (startDate) filters.startDate = new Date(String(startDate));
        if (endDate) filters.endDate = new Date(String(endDate));
        if (guardId) filters.guardId = Number(guardId);
        if (category) filters.category = String(category);
        if (title) filters.title = String(title);

        const result = await maintenanceService.getMaintenances(filters);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const resolveMaintenance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
        }

        const result = await maintenanceService.resolveMaintenance(Number(id), Number(userId));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getPendingCount = async (req: Request, res: Response) => {
    try {
        const count = await maintenanceService.getPendingMaintenancesCount();
        return res.status(200).json(createTResult({ count }));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const deleteMaintenance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const maintenance = await maintenanceService.getMaintenanceById(Number(id));
        if (!maintenance) {
            return res.status(404).json(createTResult(null, ["Mantenimiento no encontrado"]));
        }

        await maintenanceService.deleteMaintenance(Number(id));
        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const deleteMedia = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { key } = req.query;

        if (!key) {
            return res.status(400).json(createTResult(null, ["Falta el key del archivo"]));
        }

        const maintenance = await maintenanceService.getMaintenanceById(Number(id));
        if (!maintenance || !maintenance.media) {
            return res.status(404).json(createTResult(null, ["Mantenimiento o media no encontrada"]));
        }

        const media = maintenance.media as any[];
        const updatedMedia = media.filter((m: any) => {
            if (!m) return false;
            const mKey = m.key || (typeof m.url === 'string' ? m.url.split('/').pop() : null);
            return mKey !== String(key);
        });

        await maintenanceService.updateMaintenanceMedia(Number(id), updatedMedia);
        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
