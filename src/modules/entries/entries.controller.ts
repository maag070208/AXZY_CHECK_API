import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { createVehicleEntry, getAllEntries, getEntryById, getLastEntryByUser, getUniqueVehiclesByUser } from "./entries.service";

export const getEntries = async (req: Request, res: Response) => {
  try {
    const entries = await getAllEntries();
    return res.status(200).json(createTResult(entries));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await getEntryById(Number(id));
    if (!entry) {
        return res.status(404).json(createTResult(null, ["Entry not found"]));
    }
    return res.status(200).json(createTResult(entry));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getLatestUserEntry = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const entry = await getLastEntryByUser(Number(userId));
        return res.status(200).json(createTResult(entry));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getUserVehicles = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const vehicles = await getUniqueVehiclesByUser(Number(userId));
        return res.status(200).json(createTResult(vehicles));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const addEntry = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    // req.files is set by multer (fields)
    
    const photosData: { category: string; imageUrl: string; description?: string }[] = [];

    // Multer: req.files is an object with fieldname keys (e.g. "photo_frontal")
    // value is Array of files.
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (files) {
        for (const key of Object.keys(files)) {
            // key example: "photo_frontal" -> category "frontal"
            const category = key.replace("photo_", ""); 
            const fileArray = files[key];
            
            if (fileArray && fileArray.length > 0) {
                const file = fileArray[0];
                // URL relative to server root, served via /uploads
                const imageUrl = `/uploads/${file.filename}`;
                photosData.push({ category, imageUrl });
            }
        }
    }

    // HANDLE PHOTOS FROM BODY (already uploaded via /uploads endpoint)
    // Expect body.photos to be JSON string if sent via FormData mix or array if JSON
    let bodyPhotos = body.photos;
    if (typeof bodyPhotos === 'string') {
        try {
            bodyPhotos = JSON.parse(bodyPhotos);
        } catch (e) {
            bodyPhotos = [];
        }
    }

    if (Array.isArray(bodyPhotos)) {
        bodyPhotos.forEach((p: any) => {
            if (p.category && p.imageUrl) {
                photosData.push({ category: p.category, imageUrl: p.imageUrl, description: p.description });
            }
        });
    }

    const newEntry = await createVehicleEntry({
        userId: Number(body.userId),
        operatorUserId: Number(body.operatorUserId),
        brand: body.brand,
        model: body.model,
        color: body.color,
        plates: body.plates,
        mileage: Number(body.mileage),
        notes: body.notes,
        photos: photosData,
        locationId: body.locationId ? Number(body.locationId) : undefined
    });

    return res.status(201).json(createTResult(newEntry));
  } catch (error: any) {
    console.error(error);
    return res.status(500).json(createTResult(null, error.message));
  }
};
