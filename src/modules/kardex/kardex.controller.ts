import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { registerCheck, getKardex, getKardexById, updateKardex, getDataTableKardex, deleteKardex, updateKardexMedia } from "./kardex.service";
import { StorageService } from "../storage/storage.service";

const storageService = new StorageService();

export const createKardexEntry = async (req: Request, res: Response) => {
  try {
    const { userId, locationId, notes, media, latitude, longitude, assignmentId } = req.body;

    if (!userId || !locationId) {
      return res.status(400).json(createTResult(null, ["userId and locationId are required"]));
    }

    const entry = await registerCheck({
      userId: Number(userId),
      locationId: Number(locationId),
      notes,
      media,
      latitude,
      longitude,
      assignmentId: assignmentId ? Number(assignmentId) : undefined,
    });

    return res.status(201).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const updateKardexEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, media, latitude, longitude } = req.body;

    const entry = await updateKardex(Number(id), {
      notes,
      media,
      latitude,
      longitude,
    });

    return res.status(200).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getKardexEntries = async (req: Request, res: Response) => {
  try {
    const { userId, locationId, startDate, endDate } = req.query;

    const entries = await getKardex({
      userId: userId ? Number(userId) : undefined,
      locationId: locationId ? Number(locationId) : undefined,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    return res.status(200).json(createTResult(entries));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getKardexDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const numericId = Number(id);

    if (isNaN(numericId)) {
        return res.status(400).json(createTResult(null, ["Invalid ID"]));
    }

    const entry = await getKardexById(numericId);

    if (!entry) {
      return res.status(404).json(createTResult(null, ["Kardex entry not found"]));
    }

    return res.status(200).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getDataTableKardexEntries = async (req: Request, res: Response) => {
  try {
    const { page, limit, filters, sort } = req.body;

    const result = await getDataTableKardex({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      filters: filters || {},
      sort: sort || undefined,
    });

    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    console.error(error);
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const deleteKardexEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await getKardexById(Number(id));
    
    if (!entry) {
      return res.status(404).json(createTResult(null, ["Registro no encontrado"]));
    }

    /* 
    NOTE: User requested NOT to delete files from S3 when deleting the record.
    Files are only deleted via deleteMedia (individual deletion).
    */

    await deleteKardex(Number(id));
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

    const entry = await getKardexById(Number(id));
    if (!entry || !entry.media) {
      return res.status(404).json(createTResult(null, ["Registro o media no encontrada"]));
    }

    // 1. Delete from S3
    const bucketName = process.env.AWS_BUCKET_NAME;
    if (bucketName) {
      try {
        await storageService.deleteFile(bucketName, String(key));
      } catch (err) {
        console.error("Error deleting from S3:", err);
      }
    }

    // 2. Update DB
    const media = entry.media as any[];
    const updatedMedia = media.filter((m: any) => {
      if (!m) return false;
      const mKey = m.key || (typeof m.url === 'string' ? m.url.split('/').pop() : null);
      return mKey !== String(key);
    });
    
    await updateKardexMedia(Number(id), updatedMedia);

    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
