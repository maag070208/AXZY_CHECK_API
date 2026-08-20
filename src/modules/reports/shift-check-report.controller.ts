import { Request, Response } from "express";
import { z } from "zod";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import {
    PdfDocumentConfig,
    PdfReportItem,
    streamModulePdf,
} from "./pdf-report.renderer";
import {
    getShiftChecksByElementForReport,
    getShiftChecksForReport,
    getShiftChecksSummary,
} from "./shift-check-report.service";

const SHIFT_PDF_CONFIG: PdfDocumentConfig = {
    moduleLabel: "Verificación de Turno",
    headerEyebrow: "REPORTE EJECUTIVO",
    heroTitle: "Verificación de Cambio de Turno",
    platformSubtitle: "Plataforma de control operativo",
    docTitle: "Reporte de Verificación de Turno",
    docKeywords: "verificacion, turno, reporte, ejecutivo",
    filePrefix: "reporte-verificacion-turno",
    singularNoun: "verificación",
    pluralNoun: "verificaciones",
    ctaText: "El detalle de cada verificación se encuentra en las páginas siguientes.",
    detailSectionTitle: "Detalle de verificaciones",
    singularDetailEntity: "Verificación",
    pendingLabel: "PENDIENTE",
    attendedLabel: "ATENDIDA",
};

const baseQuerySchema = z.object({
    query: z.object({
        startDate: z.string().datetime({ message: "startDate ISO requerido" }),
        endDate: z.string().datetime({ message: "endDate ISO requerido" }),
        ids: z.string().optional().transform((val) => {
                if (!val) return [] as string[];
                return val.split(",").map((v: any) => v.trim()).filter((v: any) => v.length > 0);
            }),
        includeImages: z.string().optional().transform((val) => val === undefined || (val.toLowerCase() !== "false" && val !== "0")),
        includeLocation: z.string().optional().transform((val) => val === undefined || (val.toLowerCase() !== "false" && val !== "0")),
    }),
});

const elementQuerySchema = z.object({
    query: z.object({
        startDate: z.string().datetime({ message: "startDate ISO requerido" }),
        endDate: z.string().datetime({ message: "endDate ISO requerido" }),
    }),
    params: z.object({
        userId: z.string().regex(/^\d+$/, "userId inválido"),
    }),
});

/**
 * @description GET /reports/shift-check/pdf
 * Reporte general de asistencia/puntualidad.
 */
export const getShiftCheckPdf = async (req: Request, res: Response): Promise<void> => {
    const parsed = baseQuerySchema.safeParse({ query: req.query });
    if (!parsed.success) {
        res.status(400).json({
            data: null,
            success: false,
            messages: parsed.error.issues.map((i: any) => i.message),
        });
        return;
    }

    const { startDate, endDate, ids, includeImages, includeLocation } = parsed.data.query;

    try {
        const items = (await getShiftChecksForReport({
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            ids: ids.length > 0 ? ids: undefined,
        })) as PdfReportItem[];

        await streamModulePdf(
            res,
            items,
            startDate,
            endDate,
            SHIFT_PDF_CONFIG,
            { includeImages, includeLocation });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message: "Error inesperado";
        if (!res.headersSent) {
            res.status(500).json({
                data: null,
                success: false,
                messages: [message],
            });
        } else {
            res.end;
        }
    }
};

/**
 * @description GET /reports/shift-check/element/:userId/pdf
 * Expediente individual de un elemento.
 */
export const getShiftCheckElementPdf = async (req: Request, res: Response): Promise<void> => {
    const parsed = elementQuerySchema.safeParse({ query: req.query, params: req.params });
    if (!parsed.success) {
        res.status(400).json({
            data: null,
            success: false,
            messages: parsed.error.issues.map((i: any) => i.message),
        });
        return;
    }
    const { startDate, endDate } = parsed.data.query;
    const userId = Number(parsed.data.params.userId);

    try {
        const items = (await getShiftChecksByElementForReport({
            userId,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
        })) as PdfReportItem[];

        await streamModulePdf(
            res,
            items,
            startDate,
            endDate,
            {...SHIFT_PDF_CONFIG, docTitle: "Expediente de Verificación de Turno" },
            { includeImages: false, includeLocation: false });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message: "Error inesperado";
        if (!res.headersSent) {
            res.status(500).json({
                data: null,
                success: false,
                messages: [message],
            });
        } else {
            res.end;
        }
    }
};

/**
 * @description GET /reports/shift-check/summary?startDate=...&endDate=...
 * Métricas consolidadas por periodo. JSON.
 */
export const getShiftCheckSummary = async (req: Request, res: Response): Promise<Response> => {
    try {
        const startDate = req.query.startDate ? new Date(String(req.query.startDate)): null;
        const endDate = req.query.endDate ? new Date(String(req.query.endDate)): null;
        if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json(createTResult(null, ["startDate y endDate ISO requeridos"]));
        }
        const summary = await getShiftChecksSummary({ startDate, endDate });
        return res.status(200).json(createTResult(summary));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, [error.message]));
    }
};
