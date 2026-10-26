import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { prismaClient } from "@src/core/config/database";
import { listAccessEvents } from "./access-control.service";

export const myEvents = async (req: Request, res: Response) => {
  try {
    const user = await prismaClient.user.findUnique({ where: { id: Number(req.user?.id) }, select: { propertyId: true } });
    const resident = user?.propertyId
      ? null
      : await prismaClient.resident.findFirst({
          where: { person: { userId: Number(req.user?.id) }, status: "ACTIVE" },
          select: { propertyId: true },
        });
    const propertyId = user?.propertyId ?? resident?.propertyId;
    if (!propertyId) return res.status(200).json(createTResult({ items: [], total: 0, page: 1, pageSize: 25 }));
    const result = await listAccessEvents({ ...(req.query as any), propertyId });
    return res.status(200).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
