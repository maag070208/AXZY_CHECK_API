import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as dashboardService from "./dashboard.service";

/** @description GET /dashboard/live — snapshot for the WEB admin dashboard. */
export const getLive = async (_req: Request, res: Response) => {
  try {
    const result = await dashboardService.getLiveDashboard();
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};
