import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as dashboardService from "./dashboard.service";
import { respondError } from "@src/core/errors/http-error";

/** @description GET /dashboard/live — snapshot for the WEB admin dashboard. */
export const getLive = async (req: Request, res: Response) => {
  try {
    // Multicliente: el dashboard es del cliente del alcance (`req.scope`); sin cliente responde 403.
    const result = await dashboardService.getLiveDashboard(req.scope);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};
