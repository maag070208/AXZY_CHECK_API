import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { StorageService } from "../storage/storage.service";
import * as clubService from "./club.service";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await clubService.getDataTableClub(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

const storageService = new StorageService();

export const createClub = async (req: Request, res: Response) => {
  try {
    const { title, categoryId, typeId, description, media, latitude, longitude, clientRef, createdAt } = req.body;
    // @ts-ignore
    const guardId = req.user?.id;

    if (!guardId) {
        return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const mediaFiles = media || [];

    const result = await clubService.createClub({
      guardId: Number(guardId),
      title,
      categoryId: categoryId ? Number(categoryId) : undefined,
      typeId: typeId ? Number(typeId) : undefined,
      description,
      media: mediaFiles.length > 0 ? mediaFiles : undefined,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      clientRef: clientRef ? String(clientRef) : undefined,
      createdAt: createdAt ? new Date(String(createdAt)) : undefined,
    });

    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getClubs = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, guardId, category, title } = req.query;

        const filters: any = {};
        if (startDate) filters.startDate = new Date(String(startDate));
        if (endDate) filters.endDate = new Date(String(endDate));
        if (guardId) filters.guardId = Number(guardId);
        if (category) filters.category = String(category);
        if (title) filters.title = String(title);

        const result = await clubService.getClubs(filters);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const resolveClub = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
        }

        const result = await clubService.resolveClub(Number(id), Number(userId));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getPendingCount = async (req: Request, res: Response) => {
    try {
        const count = await clubService.getPendingClubsCount();
        return res.status(200).json(createTResult({ count }));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const deleteClub = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const club = await clubService.getClubById(Number(id));
        if (!club) {
            return res.status(404).json(createTResult(null, ["Registro no encontrado"]));
        }

        await clubService.deleteClub(Number(id));
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

        const club = await clubService.getClubById(Number(id));
        if (!club || !club.media) {
            return res.status(404).json(createTResult(null, ["Registro o media no encontrada"]));
        }

        const bucketName = process.env.AWS_BUCKET_NAME;
        if (bucketName) {
            try {
                await storageService.deleteFile(bucketName, String(key));
            } catch (s3Err) {
                console.error("Error deleting casa club file from S3:", s3Err);
            }
        }

        const media = club.media as any[];
        const updatedMedia = media.filter((m: any) => {
            if (!m) return false;
            const mKey = m.key || (typeof m.url === 'string' ? m.url.split('/').pop() : null);
            return mKey !== String(key);
        });
        await clubService.updateClubMedia(Number(id), updatedMedia);

        return res.status(200).json(createTResult(true));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
