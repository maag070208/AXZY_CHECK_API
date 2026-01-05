import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json(createTResult(null, ["No file uploaded"]));
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    // Return the URL
    return res.status(200).json(createTResult({ url: imageUrl }));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
