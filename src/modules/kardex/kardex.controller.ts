import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { registerCheck, getKardex, getKardexById, updateKardex, getDataTableKardex, deleteKardex, updateKardexMedia } from "./kardex.service";
import { StorageService } from "../storage/storage.service";
import { roleHasPermission } from "@src/core/permissions/permissions.service";
import { respondError } from "@src/core/errors/http-error";
import { getClientRef, getOccurredAt } from "@src/core/utils/idempotency";

const storageService = new StorageService();

const FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción";

/** ¿Quien llama es el dueño del registro (`ownerId`) o tiene el permiso de supervisión kardex.manage? */
const canActOnBehalf = async (req: Request, ownerId: number): Promise<boolean> => {
  const user = req.user as { id: number; role: string };
  return Number(user.id) === ownerId || (await roleHasPermission(user.role, "kardex.manage"));
};

export const createKardexEntry = async (req: Request, res: Response) => {
  try {
    const { userId, locationId, notes, media, latitude, longitude, assignmentId, roundId } = req.body;
    const clientRef = getClientRef(req);
    const scannedAt = getOccurredAt(req, "scannedAt");

    if (!userId || !locationId) {
      return res.status(400).json(createTResult(null, ["userId and locationId are required"]));
    }

    // Un escaneo es evidencia de quien lo hace: solo se registra a nombre propio. La supervisión
    // (kardex.manage) puede capturar a nombre de un guardia.
    if (!(await canActOnBehalf(req, Number(userId)))) {
      return res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
    }

    const entry = await registerCheck({
      userId: Number(userId),
      locationId: Number(locationId),
      notes,
      media,
      latitude,
      longitude,
      assignmentId: assignmentId ? Number(assignmentId) : undefined,
      roundId: roundId ? Number(roundId) : undefined,
      clientRef,
      scannedAt,
    });

    return res.status(201).json(createTResult(entry));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const updateKardexEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, media, latitude, longitude } = req.body;

    const existing = await getKardexById(Number(id));
    if (!existing) {
      return res.status(404).json(createTResult(null, ["Registro no encontrado"]));
    }
    if (!(await canActOnBehalf(req, existing.userId))) {
      return res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
    }

    const entry = await updateKardex(Number(id), {
      notes,
      media,
      latitude,
      longitude,
    });

    return res.status(200).json(createTResult(entry));
  } catch (error: any) {
    return respondError(res, error);
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
    return respondError(res, error);
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
    return respondError(res, error);
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
    return respondError(res, error);
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
    return respondError(res, error);
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
    return respondError(res, error);
  }
};
