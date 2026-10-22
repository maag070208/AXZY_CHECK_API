import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { API_META } from "@src/core/constants/api-version";

export const helloWorld = async (req: Request, res: Response) => {
  res.json(
    createTResult({
      message: "Hello World v1.0.2",
      apiVersion: API_META.apiVersion,
    }),
  );
};

export const apiMeta = async (_req: Request, res: Response) => {
  return res.status(200).json(
    createTResult({
      ...API_META,
      serverTime: new Date().toISOString(),
    }),
  );
};
