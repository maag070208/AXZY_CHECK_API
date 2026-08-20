import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { createUniformCheckSchema, uniformCheckQuerySchema } from "./uniform-check.dto";
import * as uniformCheckService from "./uniform-check.service";

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await uniformCheckService.getDataTableUniformChecks(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const createUniformCheck = async (req: Request, res: Response) => {
    try {
        const parsed = createUniformCheckSchema.safeParse({ body: req.body });
        if (!parsed.success) {
            return res.status(400).json(createTResult(null, parsed.error.issues.map((i: any) => i.message)));
        }
        // @ts-ignore
        const actorId = Number(req.user?.id);
        if (!actorId)
            return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));

        const result = await uniformCheckService.createUniformCheck(parsed.data.body, actorId);
        return res.status(201).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const getUniformCheck = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const result = await uniformCheckService.getUniformCheckById(id);
        if (!result)
            return res.status(404).json(createTResult(null, ["UniformCheck no encontrado"]));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const getItemsCatalog = async (_req: Request, res: Response) => {
    try {
        const result = uniformCheckService.getUniformItemsCatalog();
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const listHistoryByUser = async (req: Request, res: Response) => {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json(createTResult(null, ["userId inválido"]));
        }
        const startDate = req.query.startDate
            ? new Date(String(req.query.startDate)): undefined;
        const endDate = req.query.endDate ? new Date(String(req.query.endDate)): undefined;
        const result = await uniformCheckService.getUniformCheckHistoryByUser(
            userId,
            startDate,
            endDate);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const listUniformChecks = async (req: Request, res: Response) => {
    try {
        const parsed = uniformCheckQuerySchema.safeParse({ query: req.query });
        if (!parsed.success) {
            return res.status(400).json(createTResult(null, parsed.error.issues.map((i: any) => i.message)));
        }
        const { startDate, endDate, context, userId, checkedById } = parsed.data.query;
        const where: any = {};
        if (startDate && endDate) where.checkedAt = { gte: startDate, lte: endDate };
        if (context) where.context = context;
        if (userId) where.userId = userId;
        if (checkedById) where.checkedById = checkedById;

        const result = await (
            await import("@src/core/config/database")
        ).prismaClient.uniformCheck.findMany({
            where,
            orderBy: { checkedAt: "desc" },
            include: {
                user: { select: { id: true, name: true, lastName: true, username: true } },
                checkedBy: { select: { id: true, name: true, lastName: true } },
            },
        });
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};