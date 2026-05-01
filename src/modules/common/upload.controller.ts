import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { StorageService } from "../storage/storage.service";

const storageService = new StorageService();

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json(createTResult(null, ["No file uploaded"]));
    }

    const bucketName = process.env.AWS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("Storage bucket name not configured");
    }

    const start = Date.now();
    const user = res.locals.user;
    const locationName = req.body.location || "unknown";
    
    // Format: name_quiensubio_locacion_fechayhora_minuto_segudo
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T.]/g, "").slice(0, 14); // YYYYMMDDHHmmss

    // Sanitize strings
    const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "_");
    const uploader = user ? sanitize(user.username || user.name || "user") : "anon";
    const loc = sanitize(locationName);
    const ext = req.file.originalname.split('.').pop();

    const finalName = `${uploader}_${loc}_${dateStr}.${ext}`;

    const result = await storageService.uploadFile(req.file, bucketName, finalName);
    
    // AWS S3 Public URL format: https://bucket.s3.region.amazonaws.com/key
    const region = process.env.AWS_REGION || 'us-east-2';
    const fullUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${finalName}`;

    // Return the URL and metadata
    return res.status(200).json(
      createTResult({
        url: fullUrl,
        type: req.file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
        mimetype: req.file.mimetype,
        size: req.file.size,
        bucket: result.bucket,
        key: result.key
      })
    );
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
