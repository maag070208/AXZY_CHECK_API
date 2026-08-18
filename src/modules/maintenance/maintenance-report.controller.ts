import { Request, Response } from "express";
import { maintenancePdfQuerySchema } from "./maintenance-report.dto";
import { getMaintenancesForReport } from "./maintenance-report.service";
import { PdfDocumentConfig, PdfReportItem, streamModulePdf } from "@src/modules/reports/pdf-report.renderer";

const MAINTENANCE_PDF_CONFIG: PdfDocumentConfig = {
    moduleLabel: "Mantenimientos",
    headerEyebrow: "REPORTE EJECUTIVO",
    heroTitle: "Mantenimientos del Sitio",
    platformSubtitle: "Plataforma de control operativo",
    docTitle: "Reporte Ejecutivo de Mantenimientos",
    docKeywords: "mantenimiento, operaciones, reporte, ejecutivo",
    filePrefix: "reporte-mantenimientos",
    singularNoun: "mantenimiento",
    pluralNoun: "mantenimientos",
    ctaText: "El detalle de cada mantenimiento se encuentra en las páginas siguientes.",
    detailSectionTitle: "Detalle de mantenimientos",
    singularDetailEntity: "Mantenimiento",
    pendingLabel: "PENDIENTE",
    attendedLabel: "ATENDIDO",
};

/**
 * @description Endpoint que devuelve un PDF con el detalle de los mantenimientos
 * filtrados por rango de fecha y, opcionalmente, por IDs seleccionados
 * desde la UI.
 */
export const getMaintenancesPdf = async (req: Request, res: Response): Promise<void> => {
    const parsed = maintenancePdfQuerySchema.safeParse({ query: req.query });
    if (!parsed.success) {
        res.status(400).json({
            data: null,
            success: false,
            messages: parsed.error.issues.map((i) => i.message),
        });
        return;
    }

    const { startDate, endDate, ids, includeImages, includeLocation } = parsed.data.query;

    try {
        const items = (await getMaintenancesForReport({
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            ids: ids.length > 0 ? ids : undefined,
        })) as PdfReportItem[];

        await streamModulePdf(
            res,
            items,
            startDate,
            endDate,
            MAINTENANCE_PDF_CONFIG,
            { includeImages, includeLocation },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        if (!res.headersSent) {
            res.status(500).json({
                data: null,
                success: false,
                messages: [message],
            });
        } else {
            res.end();
        }
    }
};
