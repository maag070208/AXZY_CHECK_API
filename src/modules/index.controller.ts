import { createTResult } from "@src/core/mappers/tresult.mapper";
import { API_NAME, API_VERSION } from "@src/core/constants/api.constants";
import { Request, Response } from "express";

export const helloWorld = async (req: Request, res: Response) => {
  res.json(
    createTResult({
      service: API_NAME,
      version: API_VERSION,
      message: `Hello World ${API_VERSION}`,
    }),
  );
};
