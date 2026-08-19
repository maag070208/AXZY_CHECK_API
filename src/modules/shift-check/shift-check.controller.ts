import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import {
    createShiftCheckSchema,
    signShiftCheckSchema,
    updateShiftCheckSchema,
    shiftCheckQuerySchema,
} from "./shift-check.dto";
import * as shiftCheckService from "./shift-check.service";

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await shiftCheckService.getDataTableShiftChecks(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const createShiftCheck = async (req: Request, res: Response) => {
    try {
        const parsed = createShiftCheckSchema.safeParse({ body: req.body });
        if (!parsed.success) {
            return res
                .status(400)
                .json(createTResult(null, parsed.error.issues.map((i) => i.message)));
        }
        // @ts-ignore
        const actorId = Number(req.user?.id);
        if (!actorId) return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));

        const result = await shiftCheckService.createShiftCheck(parsed.data.body, actorId);
        return res.status(201).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const updateShiftCheck = async (req: Request, res: Response) => {
    try {
        const parsed = updateShiftCheckSchema.safeParse({ body: req.body, params: req.params });
        if (!parsed.success) {
            return res
                .status(400)
                .json(createTResult(null, parsed.error.issues.map((i) => i.message)));
        }
        const result = await shiftCheckService.updateShiftCheck(
            String(req.params.id),
            parsed.data.body,
        );
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        const status = error.message === "ShiftCheck no encontrado" ? 404 : 400;
        return res.status(status).json(createTResult(null, [error.message]));
    }
};

export const signShiftCheck = async (req: Request, res: Response) => {
    try {
        const parsed = signShiftCheckSchema.safeParse({ body: req.body, params: req.params });
        if (!parsed.success) {
            return res
                .status(400)
                .json(createTResult(null, parsed.error.issues.map((i) => i.message)));
        }
        const result = await shiftCheckService.signShiftCheck(
            String(req.params.id),
            parsed.data.body,
        );
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(400).json(createTResult(null, [error.message]));
    }
};

export const getShiftCheck = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const result = await shiftCheckService.getShiftCheckById(id);
        if (!result) return res.status(404).json(createTResult(null, ["ShiftCheck no encontrado"]));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const getDayOverview = async (req: Request, res: Response) => {
    try {
        const date = req.query.date ? new Date(String(req.query.date)) : new Date();
        const result = await shiftCheckService.getShiftDayOverview(date);
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
        const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
        const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
        const result = await shiftCheckService.getShiftCheckHistoryByUser(userId, startDate, endDate);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};

export const listShiftChecks = async (req: Request, res: Response) => {
    try {
        const parsed = shiftCheckQuerySchema.safeParse({ query: req.query });
        if (!parsed.success) {
            return res
                .status(400)
                .json(createTResult(null, parsed.error.issues.map((i) => i.message)));
        }
        const { startDate, endDate, shiftType, status, userId, createdById } = parsed.data.query;
        const where: any = {};
        if (startDate && endDate) where.shiftDate = { gte: startDate, lte: endDate };
        if (shiftType) where.shiftType = shiftType;
        if (status) where.status = status;
        if (userId) where.userId = userId;
        if (createdById) where.createdById = createdById;

        const result = await (
            await import("@src/core/config/database")
        ).prismaClient.shiftCheck.findMany({
            where,
            orderBy: { shiftDate: "desc" },
            include: {
                user: { select: { id: true, name: true, lastName: true, username: true } },
                createdBy: { select: { id: true, name: true, lastName: true } },
            },
        });
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};
