import { Request, Response } from "express";
import { incidentPdfQuerySchema } from "./incident-report.dto";
import { getIncidentsForReport } from "./incident-report.service";
import { PdfDocumentConfig, PdfReportItem, streamModulePdf } from "./pdf-report.renderer";

const INCIDENT_PDF_CONFIG: PdfDocumentConfig = {
    moduleLabel: "Incidencias",
    headerEyebrow: "REPORTE EJECUTIVO",
    heroTitle: "Incidencias de Seguridad",
    platformSubtitle: "Plataforma de control operativo",
    docTitle: "Reporte Ejecutivo de Incidencias",
    docKeywords: "incidencias, seguridad, reporte, ejecutivo",
    filePrefix: "reporte-incidencias",
    singularNoun: "incidencia",
    pluralNoun: "incidencias",
    ctaText: "El detalle de cada incidencia se encuentra en las páginas siguientes.",
    detailSectionTitle: "Detalle de incidencias",
    singularDetailEntity: "Incidencia",
    pendingLabel: "PENDIENTE",
    attendedLabel: "ATENDIDA",
};

/**
 * @description Endpoint que devuelve un PDF con el detalle de las incidencias
 * filtradas por rango de fecha y, opcionalmente, por IDs seleccionados
 * desde la UI.
 */
export const getIncidentsPdf = async (req: Request, res: Response): Promise<void> => {
    const parsed = incidentPdfQuerySchema.safeParse({ query: req.query });
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
        const items = (await getIncidentsForReport({
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            ids: ids.length > 0 ? ids : undefined,
        })) as PdfReportItem[];

        await streamModulePdf(
            res,
            items,
            startDate,
            endDate,
            INCIDENT_PDF_CONFIG,
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
