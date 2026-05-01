import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { StorageService } from "../storage/storage.service";
import * as incidentService from "./incident.service";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await incidentService.getDataTableIncidents(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

const storageService = new StorageService();

export const createIncident = async (req: Request, res: Response) => {
  try {
    const { title, categoryId, typeId, description, media, latitude, longitude } = req.body;
    // @ts-ignore
    const guardId = req.user?.id;

    if (!guardId) {
        return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }
    console.log("body", req.body);
    // Media is now passed as an array of objects { type, url, key }
    const mediaFiles = media || [];

    const result = await incidentService.createIncident({
      guardId: Number(guardId),
      title,
      categoryId: categoryId ? Number(categoryId) : undefined,
      typeId: typeId ? Number(typeId) : undefined,
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

export const getIncidents = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, guardId, category, title } = req.query;

        const filters: any = {};
        if (startDate) filters.startDate = new Date(String(startDate));
        if (endDate) filters.endDate = new Date(String(endDate));
        if (guardId) filters.guardId = Number(guardId);
        if (category) filters.category = String(category);
        if (title) filters.title = String(title);

        const result = await incidentService.getIncidents(filters);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const resolveIncident = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
        }

        const result = await incidentService.resolveIncident(Number(id), Number(userId));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getPendingCount = async (req: Request, res: Response) => {
    try {
        const count = await incidentService.getPendingIncidentsCount();
        return res.status(200).json(createTResult({ count }));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const deleteIncident = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const incident = await incidentService.getIncidentById(Number(id));
        if (!incident) {
            return res.status(404).json(createTResult(null, ["Incidencia no encontrada"]));
        }

        /* 
        NOTE: User requested NOT to delete files from S3 when deleting the incident record.
        Files are only deleted via deleteMedia (individual deletion).
        */

        await incidentService.deleteIncident(Number(id));
        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const deleteMedia = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { key } = req.query; // Key of the file in S3

        if (!key) {
            return res.status(400).json(createTResult(null, ["Falta el key del archivo"]));
        }

        const incident = await incidentService.getIncidentById(Number(id));
        if (!incident || !incident.media) {
            return res.status(404).json(createTResult(null, ["Incidencia o media no encontrada"]));
        }

        // 1. Delete from S3
        const bucketName = process.env.AWS_BUCKET_NAME;
        if (bucketName) {
            try {
                await storageService.deleteFile(bucketName, String(key));
            } catch (s3Err) {
                console.error("Scale error deleting from S3:", s3Err);
            }
        }

        // 2. Update DB
        const media = incident.media as any[];
        const updatedMedia = media.filter((m: any) => {
            if (!m) return false;
            const mKey = m.key || (typeof m.url === 'string' ? m.url.split('/').pop() : null);
            return mKey !== String(key);
        });
        await incidentService.updateIncidentMedia(Number(id), updatedMedia);

        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
