import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { prismaClient } from "@src/core/config/database";
import { API_NAME, API_VERSION } from "@src/core/constants/api.constants";

const SERVER_STARTED_AT = Date.now();

export interface HealthCheckDTO {
  status: "ok" | "degraded" | "down";
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  environment: NodeJS.ProcessEnv["NODE_ENV"];
  database: {
    status: "up" | "down";
    latencyMs: number | null;
    error: string | null;
  };
}

const checkDatabase = async (): Promise<HealthCheckDTO["database"]> => {
  const start = performance.now();
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    return {
      status: "up",
      latencyMs: Math.round(performance.now() - start),
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al consultar la base de datos";
    return {
      status: "down",
      latencyMs: null,
      error: message,
    };
  }
};

export const getHealth = async (_req: Request, res: Response): Promise<Response> => {
  const database = await checkDatabase();
  const status: HealthCheckDTO["status"] =
    database.status === "up" ? "ok" : "degraded";
  const httpStatus = database.status === "up" ? 200 : 503;

  const payload: HealthCheckDTO = {
    status,
    service: API_NAME,
    version: API_VERSION,
    uptime: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
    database,
  };

  return res.status(httpStatus).json(createTResult(payload));
};
