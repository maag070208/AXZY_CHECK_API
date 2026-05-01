import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";

export const helloWorld = async (req: Request, res: Response) => {
  res.json(
    createTResult({
      message: "Hello World",
    })
  );
};
