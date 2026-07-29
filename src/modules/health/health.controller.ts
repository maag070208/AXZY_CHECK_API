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
  pool: {
    limit: number;
    active: number;
    idle: number;
    total: number;
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

const checkPool = async (): Promise<HealthCheckDTO["pool"]> => {
  try {
    const result = await prismaClient.$queryRaw<Array<{ count: bigint; state: string }>>`
        SELECT count(*)::bigint as count, state
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND application_name LIKE '%prisma%'
        GROUP BY state
    `;
    const byState: Record<string, number> = {};
    (result as any[]).forEach((r) => {
      byState[r.state] = Number(r.count);
    });
    const active = byState.active ?? 0;
    const idle = byState.idle ?? 0;
    return {
      limit: parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "10", 10),
      active,
      idle,
      total: active + idle,
    };
  } catch {
    return {
      limit: parseInt(process.env.PRISMA_CONNECTION_LIMIT ?? "10", 10),
      active: 0,
      idle: 0,
      total: 0,
    };
  }
};

export const getHealth = async (_req: Request, res: Response): Promise<Response> => {
  const [database, pool] = await Promise.all([checkDatabase(), checkPool()]);
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
    pool,
  };

  return res.status(httpStatus).json(createTResult(payload));
};
