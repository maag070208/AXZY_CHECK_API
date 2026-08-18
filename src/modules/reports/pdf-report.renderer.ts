import axios from "axios";
import PDFDocument from "pdfkit";
import { getConfig } from "@src/core/utils/config";

/**
 * @description Paleta ejecutiva minimalista: un solo color de acento, escala
 * de grises para todo lo demás. La jerarquía se construye con peso
 * tipográfico, espacio en blanco y líneas finas.
 */
const COLOR = {
    ink: "#0f172a",
    graphite: "#475569",
    muted: "#94a3b8",
    line: "#e2e8f0",
    faint: "#f8fafc",
    paper: "#ffffff",
    accent: "#0f766e",
    pending: "#b45309",
    attended: "#0f766e",
} as const;

const PAGE_MARGIN = 56;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

/**
 * @description Item de evidencia dentro de un registro para el PDF.
 */
export interface PdfMediaItem {
    type: "IMAGE" | "VIDEO";
    url: string;
    key?: string;
}

/**
 * @description Interfaz genérica que un item del reporte debe implementar
 * para poder ser renderizado en el PDF ejecutivo. Tanto incidencias como
 * mantenimientos cumplen este contrato.
 */
export interface PdfReportItem {
    id: number;
    title: string;
    description: string | null;
    status: "PENDING" | "ATTENDED";
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedByName: string | null;
    guardName: string;
    guardUsername: string;
    categoryName: string | null;
    typeName: string | null;
    latitude: number | null;
    longitude: number | null;
    media: PdfMediaItem[];
}

/**
 * @description Opciones de renderizado del PDF.
 */
export interface PdfRenderOptions {
    includeImages: boolean;
    includeLocation: boolean;
}

/**
 * @description Configuración textual del documento. Permite generar el mismo
 * layout para distintos módulos (incidencias, mantenimientos, etc.).
 */
export interface PdfDocumentConfig {
    /** Etiqueta del módulo: "Incidencias", "Mantenimientos" */
    moduleLabel: string;
    /** Título en versalitas de la portada: "REPORTE EJECUTIVO" */
    headerEyebrow: string;
    /** Título principal de la portada */
    heroTitle: string;
    /** Subtítulo corto junto al header */
    platformSubtitle: string;
    /** Texto del título del documento PDF */
    docTitle: string;
    /** Keywords para metadata del PDF */
    docKeywords: string;
    /** Prefijo del nombre del archivo descargado */
    filePrefix: string;
    /** Texto del "Resumen Ejecutivo" y su bullets */
    singularNoun: string; // "incidencia" / "mantenimiento"
    pluralNoun: string;   // "incidencias" / "mantenimientos"
    /** Texto del CTA al final de la portada */
    ctaText: string;
    /** Texto del encabezado de la sección de detalle */
    detailSectionTitle: string;
    /** Etiqueta "Categoría" en la sección de detalle */
    singularDetailEntity: string; // "Incidencia" / "Mantenimiento"
    /** Estado labels */
    pendingLabel: string; // "PENDIENTE" / "PENDIENTE"
    attendedLabel: string; // "ATENDIDA" / "ATENDIDO"
}

/**
 * @description Genera un PDF con look ejecutivo a partir de una lista de
 * items y los configura según `config`. Devuelve el stream ya pipeado al
 * `Response`. La función maneja errores 400/500/headers-sent.
 */
export const streamModulePdf = async (
    res: import("express").Response,
    items: PdfReportItem[],
    startDate: string,
    endDate: string,
    config: PdfDocumentConfig,
    options: PdfRenderOptions,
): Promise<void> => {
    let appName = "AXZY CHECK";
    try {
        appName = getConfig("APP_NAME");
    } catch {
        /* keep default */
    }

    const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        bufferPages: true,
        info: {
            Title: config.docTitle,
            Author: appName,
            Subject: `${config.moduleLabel} del ${formatDate(startDate)} al ${formatDate(endDate)}`,
            Keywords: config.docKeywords,
        },
    });

    const filename = `${config.filePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    try {
        renderCover(doc, startDate, endDate, items, appName, options, config);
        await renderDetailSection(doc, items, options, config);
        applyExecutiveChrome(doc, appName, config);
        doc.end();
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

/* =========================================================================
 *  PORTADA + RESUMEN EJECUTIVO
 * ========================================================================= */

const renderCover = (
    doc: PDFKit.PDFDocument,
    startDate: string,
    endDate: string,
    items: PdfReportItem[],
    appName: string,
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): void => {
    const refCode = buildRefCode(items);
    const ruleY = drawMasthead(doc, appName, refCode, config);

    doc.y = ruleY + 30;
    doc.x = PAGE_MARGIN;

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(config.headerEyebrow.toUpperCase(), { characterSpacing: 2.5 });

    doc
        .moveDown(0.4)
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(30)
        .text(config.heroTitle, { width: CONTENT_WIDTH });

    doc
        .moveDown(0.15)
        .fillColor(COLOR.graphite)
        .font("Helvetica")
        .fontSize(11)
        .text(`${formatDate(startDate)}  —  ${formatDate(endDate)}`, { width: CONTENT_WIDTH });

    doc.moveDown(1.1);
    renderKpiBlock(doc, items, options, config);
    doc.moveDown(0.8);
    renderExecutiveNarrative(doc, items, options, config);
    doc.moveDown(0.6);
    renderCategoryBreakdown(doc, items, config);
    doc.moveDown(1.4);
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Oblique")
        .fontSize(8.5)
        .text(config.ctaText, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: "center" });
};

const buildRefCode = (items: PdfReportItem[]): string => {
    const now = new Date();
    const first = items[0]?.id ?? 0;
    const last = items[items.length - 1]?.id ?? 0;
    const hash = ((first * 31 + last) % 9999) + 1;
    return `REP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(hash).padStart(4, "0")}`;
};

const drawMasthead = (
    doc: PDFKit.PDFDocument,
    appName: string,
    refCode: string,
    config: PdfDocumentConfig,
): number => {
    const topY = 40;

    doc
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(appName.toUpperCase(), PAGE_MARGIN, topY, { characterSpacing: 1.5 });
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(config.platformSubtitle, PAGE_MARGIN, topY + 16);

    doc
        .fillColor(COLOR.graphite)
        .font("Helvetica")
        .fontSize(8)
        .text(`Emitido ${formatDateTime(new Date().toISOString())}`, PAGE_WIDTH - PAGE_MARGIN - 220, topY, {
            width: 220,
            align: "right",
        });
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`Ref. ${refCode}`, PAGE_WIDTH - PAGE_MARGIN - 220, topY + 12, {
            width: 220,
            align: "right",
        });

    const ruleY = topY + 34;
    doc.rect(PAGE_MARGIN, ruleY, CONTENT_WIDTH, 1.5).fillColor(COLOR.accent).fill();

    return ruleY;
};

const renderKpiBlock = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): void => {
    const pending = items.filter((i) => i.status === "PENDING").length;
    const attended = items.filter((i) => i.status === "ATTENDED").length;
    const withMedia = items.filter((i) => i.media.length > 0).length;
    const withLocation = items.filter((i) => i.latitude !== null && i.longitude !== null).length;
    const total = items.length;
    const attendedPct = total > 0 ? Math.round((attended / total) * 100) : 0;

    const cols: Array<{ label: string; value: string; sub: string }> = [
        { label: "TOTAL", value: String(total), sub: config.pluralNoun },
        { label: config.pendingLabel + "S", value: String(pending), sub: "por atender" },
        { label: config.attendedLabel + "S", value: String(attended), sub: `${attendedPct}% del total` },
        { label: "CON EVIDENCIA", value: String(withMedia), sub: "fotos / video" },
    ];

    const colWidth = CONTENT_WIDTH / cols.length;
    const startX = PAGE_MARGIN;
    const startY = doc.y;

    doc.rect(startX, startY, CONTENT_WIDTH, 1).fillColor(COLOR.line).fill();

    cols.forEach((c, idx) => {
        const x = startX + idx * colWidth;
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .text(c.label, x, startY + 12, { width: colWidth - 16, characterSpacing: 1.2 });
        doc
            .fillColor(COLOR.ink)
            .font("Helvetica-Bold")
            .fontSize(24)
            .text(c.value, x, startY + 24, { width: colWidth - 16 });
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica")
            .fontSize(8)
            .text(c.sub, x, startY + 52, { width: colWidth - 16 });
        if (idx > 0) {
            doc.rect(x, startY + 10, 0.75, 52).fillColor(COLOR.line).fill();
        }
    });

    const blockBottom = startY + 68;
    doc.rect(startX, blockBottom, CONTENT_WIDTH, 1).fillColor(COLOR.line).fill();

    doc.y = blockBottom + 12;
    doc.x = PAGE_MARGIN;

    if (withLocation > 0 && options.includeLocation) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Oblique")
            .fontSize(8.5)
            .text(
                `${withLocation} ${config.singularNoun}${withLocation === 1 ? "" : "s"} registra${withLocation === 1 ? "" : "n"} coordenadas GPS en el periodo.`,
            );
        doc.moveDown(0.4);
    }
};

const renderExecutiveNarrative = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): void => {
    drawSectionTitle(doc, "Resumen ejecutivo");

    if (items.length === 0) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Oblique")
            .fontSize(10)
            .text(`No se encontraron ${config.pluralNoun} para los filtros seleccionados.`);
        return;
    }

    const total = items.length;
    const pending = items.filter((i) => i.status === "PENDING").length;
    const attended = items.filter((i) => i.status === "ATTENDED").length;
    const resolutionRate = total > 0 ? Math.round((attended / total) * 100) : 0;

    const byCategory = new Map<string, number>();
    items.forEach((i) => {
        const key = i.categoryName ?? "General";
        byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    });
    const top = Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const bullets: string[] = [];
    bullets.push(
        `Se registraron ${total} ${config.singularNoun}${total === 1 ? "" : "es"} en el periodo, de las cuales ${attended} fueron ${config.attendedLabel.toLowerCase()}s (${resolutionRate}% de resolución).`,
    );
    if (pending > 0) {
        bullets.push(
            `Quedan ${pending} ${config.singularNoun}${pending === 1 ? "" : "s"} pendiente${pending === 1 ? "" : "s"} de atención al cierre del periodo.`,
        );
    } else {
        bullets.push(`El 100% de los ${config.pluralNoun} del periodo se encuentran ${config.attendedLabel.toLowerCase()}s.`);
    }
    if (top.length > 0) {
        const topText = top.map(([name, count]) => `${name} (${count})`).join(", ");
        bullets.push(`Categorías con mayor reporte: ${topText}.`);
    }
    if (options.includeLocation) {
        const withGps = items.filter((i) => i.latitude !== null && i.longitude !== null).length;
        if (withGps > 0) {
            bullets.push(`${withGps} reporte${withGps === 1 ? "" : "s"} incluye${withGps === 1 ? "" : "n"} coordenadas GPS verificables.`);
        }
    }

    bullets.forEach((b) => {
        const y = doc.y;
        doc.fillColor(COLOR.accent).font("Helvetica-Bold").fontSize(10).text("—", PAGE_MARGIN, y);
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica")
            .fontSize(10)
            .text(b, PAGE_MARGIN + 16, y, { width: CONTENT_WIDTH - 16 });
        doc.moveDown(0.4);
        doc.x = PAGE_MARGIN;
    });
};

const renderCategoryBreakdown = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): void => {
    if (items.length === 0) return;
    drawSectionTitle(doc, "Distribución por categoría");

    const byCategory = new Map<string, { total: number; pending: number; attended: number }>();
    items.forEach((i) => {
        const key = i.categoryName ?? "General";
        const entry = byCategory.get(key) ?? { total: 0, pending: 0, attended: 0 };
        entry.total += 1;
        if (i.status === "PENDING") entry.pending += 1;
        if (i.status === "ATTENDED") entry.attended += 1;
        byCategory.set(key, entry);
    });

    const rows = Array.from(byCategory.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 6);

    const startX = PAGE_MARGIN;
    const startY = doc.y;
    const colName = CONTENT_WIDTH * 0.42;
    const colTotal = CONTENT_WIDTH * 0.1;
    const colPending = CONTENT_WIDTH * 0.1;
    const colAttended = CONTENT_WIDTH * 0.1;
    const colBar = CONTENT_WIDTH - colName - colTotal - colPending - colAttended;
    const rowHeight = 22;

    doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7.5);
    doc.text("CATEGORÍA", startX, startY, { width: colName, characterSpacing: 1 });
    doc.text("TOTAL", startX + colName, startY, { width: colTotal, align: "center", characterSpacing: 1 });
    doc.text("PEND.", startX + colName + colTotal, startY, { width: colPending, align: "center", characterSpacing: 1 });
    doc.text("ATEND.", startX + colName + colTotal + colPending, startY, {
        width: colAttended,
        align: "center",
        characterSpacing: 1,
    });
    doc.text("DISTRIBUCIÓN", startX + colName + colTotal + colPending + colAttended, startY, {
        width: colBar,
        characterSpacing: 1,
    });

    let rowY = startY + 16;
    doc.rect(startX, rowY, CONTENT_WIDTH, 1).fillColor(COLOR.line).fill();
    rowY += 8;

    const total = items.length;
    rows.forEach(([name, counts]) => {
        doc.fillColor(COLOR.ink).font("Helvetica").fontSize(9.5).text(name, startX, rowY, { width: colName - 8 });
        doc
            .fillColor(COLOR.ink)
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .text(String(counts.total), startX + colName, rowY, { width: colTotal, align: "center" });
        doc
            .fillColor(COLOR.pending)
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .text(String(counts.pending), startX + colName + colTotal, rowY, { width: colPending, align: "center" });
        doc
            .fillColor(COLOR.attended)
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .text(String(counts.attended), startX + colName + colTotal + colPending, rowY, {
                width: colAttended,
                align: "center",
            });

        const barX = startX + colName + colTotal + colPending + colAttended;
        const barY = rowY + 3;
        const barWidth = colBar - 8;
        doc.rect(barX, barY, barWidth, 3).fillColor(COLOR.faint).fill();
        const filled = (counts.total / total) * barWidth;
        doc.rect(barX, barY, filled, 3).fillColor(COLOR.accent).fill();

        rowY += rowHeight;
        doc.rect(startX, rowY - 6, CONTENT_WIDTH, 0.5).fillColor(COLOR.line).fill();
    });

    doc.y = rowY + 2;
    doc.x = PAGE_MARGIN;
};

/* =========================================================================
 *  DETALLE
 * ========================================================================= */

const renderDetailSection = async (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): Promise<void> => {
    doc.addPage();
    drawSectionTitle(doc, config.detailSectionTitle);

    if (items.length === 0) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Oblique")
            .fontSize(11)
            .text(`No se encontraron ${config.pluralNoun} para los filtros seleccionados.`, { align: "center" });
        return;
    }

    for (let index = 0; index < items.length; index++) {
        await renderItemExecutive(doc, items[index], index + 1, items.length, options, config);
    }
};

const renderItemExecutive = async (
    doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    index: number,
    total: number,
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): Promise<void> => {
    const estimatedHeight = estimateItemHeight(doc, item, options);
    ensureSpace(doc, estimatedHeight + 24);

    const x = PAGE_MARGIN;
    const y = doc.y;
    const statusColor = item.status === "ATTENDED" ? COLOR.attended : COLOR.pending;
    const statusLabel = item.status === "ATTENDED" ? config.attendedLabel : config.pendingLabel;

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(`#${String(index).padStart(2, "0")}`, x, y, { width: 34 });

    doc
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(12.5)
        .text(item.title, x + 34, y, { width: CONTENT_WIDTH - 34 - 110 });

    const statusX = x + CONTENT_WIDTH - 100;
    doc.circle(statusX, y + 5, 2.5).fillColor(statusColor).fill();
    doc
        .fillColor(statusColor)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(statusLabel, statusX + 8, y, { width: 92, characterSpacing: 0.6 });

    let cursorY = y + 16;
    if (item.categoryName || item.typeName) {
        const chips = [item.categoryName, item.typeName].filter(Boolean).join("   ·   ");
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica")
            .fontSize(8.5)
            .text(chips, x + 34, cursorY, { width: CONTENT_WIDTH - 34 });
        cursorY += 14;
    }

    cursorY += 8;
    cursorY = renderMetaGrid(doc, item, x, cursorY, CONTENT_WIDTH, config);
    cursorY += 10;

    if (item.description) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .text("DESCRIPCIÓN", x, cursorY, { characterSpacing: 1 });
        cursorY += 12;
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica")
            .fontSize(9.5)
            .text(item.description, x, cursorY, { width: CONTENT_WIDTH });
        cursorY = doc.y + 8;
    }

    if (options.includeLocation && item.latitude !== null && item.longitude !== null) {
        const lat = item.latitude;
        const lng = item.longitude;
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .text("UBICACIÓN", x, cursorY, { characterSpacing: 1 });
        cursorY += 12;
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica")
            .fontSize(9.5)
            .text(`Lat ${lat.toFixed(6)}   Lng ${lng.toFixed(6)}`, x, cursorY);
        cursorY = doc.y + 6;

        const mapWidth = CONTENT_WIDTH;
        const mapHeight = 90;
        const staticUrl = buildStaticMapUrl(lat, lng, Math.round(mapWidth), Math.round(mapHeight));

        if (staticUrl) {
            ensureSpace(doc, mapHeight + 12);
            const mapBuf = await fetchImageBuffer(staticUrl);
            if (mapBuf) {
                try {
                    doc.rect(x, cursorY, mapWidth, 1.5).fillColor(COLOR.accent).fill();
                    doc.image(mapBuf, x, cursorY + 1.5, { fit: [mapWidth, mapHeight - 1.5] });
                    cursorY += mapHeight;
                } catch {
                    /* si falla, continuar con link */
                }
            }
        }

        doc
            .fillColor(COLOR.accent)
            .font("Helvetica")
            .fontSize(8.5)
            .text("Ver en Google Maps", x, cursorY, { link: mapsUrl, underline: true });
        cursorY = doc.y + 8;
    }

    if (options.includeImages && item.media.length > 0) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .text(`EVIDENCIA (${item.media.length})`, x, cursorY, { characterSpacing: 1 });
        cursorY += 12;
        for (const m of item.media) {
            cursorY = await renderEvidenceLine(doc, m, x, cursorY, CONTENT_WIDTH);
        }
    }

    const bottomY = Math.max(cursorY, y + estimatedHeight) + 6;
    doc.rect(x, bottomY, CONTENT_WIDTH, 0.75).fillColor(COLOR.line).fill();

    doc.y = bottomY + 18;
    doc.x = PAGE_MARGIN;
};

const renderMetaGrid = (
    doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    x: number,
    y: number,
    width: number,
    _config: PdfDocumentConfig,
): number => {
    const fields: Array<{ label: string; value: string }> = [
        { label: "Reportado", value: formatDateTime(item.createdAt.toISOString()) },
        { label: "Por", value: item.guardName },
        { label: "ID", value: `#${item.id}` },
    ];
    if (item.status === "ATTENDED" && item.resolvedByName) {
        fields.push({
            label: "Atendido por",
            value: `${item.resolvedByName}${item.resolvedAt ? " · " + formatDateTime(item.resolvedAt.toISOString()) : ""}`,
        });
    }

    const colW = width / fields.length;
    fields.forEach((f, idx) => {
        const colX = x + idx * colW;
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text(f.label.toUpperCase(), colX, y, { width: colW - 10, characterSpacing: 0.8 });
        doc
            .fillColor(COLOR.ink)
            .font("Helvetica")
            .fontSize(9.5)
            .text(f.value, colX, y + 11, { width: colW - 10 });
    });

    return y + 30;
};

const renderEvidenceLine = async (
    doc: PDFKit.PDFDocument,
    item: PdfMediaItem,
    x: number,
    y: number,
    width: number,
): Promise<number> => {
    const isVideo = item.type === "VIDEO";

    if (isVideo) {
        doc.circle(x + 3, y + 5, 2).fillColor(COLOR.accent).fill();
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .text(`Video adjunto`, x + 12, y, { width: width - 12 });
        doc
            .fillColor(COLOR.accent)
            .font("Helvetica")
            .fontSize(8)
            .text(item.url, x + 12, y + 11, { width: width - 12, link: item.url, underline: true });
        return y + 24;
    }

    const buffer = await fetchImageBuffer(item.url);
    if (buffer) {
        try {
            const imgHeight = 160;
            doc.image(buffer, x, y, { fit: [width, imgHeight], align: "center", valign: "center" });
            doc
                .rect(x, y + imgHeight - 0.5, width, 0.5)
                .fillColor(COLOR.accent)
                .fill();
            doc
                .fillColor(COLOR.muted)
                .font("Helvetica")
                .fontSize(7.5)
                .text("Imagen adjunta", x, y + imgHeight + 4, { width, characterSpacing: 0.6 });
            doc
                .fillColor(COLOR.accent)
                .font("Helvetica")
                .fontSize(7.5)
                .text(item.url, x, y + imgHeight + 14, {
                    width,
                    link: item.url,
                    underline: true,
                });
            return y + imgHeight + 28;
        } catch {
            /* cae al placeholder */
        }
    }

    const fallbackHeight = 64;
    doc.rect(x, y, width, fallbackHeight).fillColor(COLOR.faint).fill();
    doc.rect(x, y, width, 0.5).fillColor(COLOR.line).fill();
    doc.rect(x, y + fallbackHeight - 0.5, width, 0.5).fillColor(COLOR.line).fill();
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text("Imagen no disponible", x, y + 12, { width, align: "center" });
    doc
        .fillColor(COLOR.accent)
        .font("Helvetica")
        .fontSize(7.5)
        .text(item.url, x, y + 28, { width, link: item.url, underline: true, align: "center" });
    return y + fallbackHeight + 8;
};

/* =========================================================================
 *  CHROME (header/footer por página)
 * ========================================================================= */

const applyExecutiveChrome = (
    doc: PDFKit.PDFDocument,
    appName: string,
    config: PdfDocumentConfig,
): void => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        if (i === range.start) {
            drawCoverFooter(doc, appName, config);
            continue;
        }
        drawInternalHeader(doc, appName, config);
        drawInternalFooter(doc, i - range.start + 1, range.count, appName, config);
    }
};

const drawInternalHeader = (doc: PDFKit.PDFDocument, appName: string, config: PdfDocumentConfig): void => {
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(appName.toUpperCase(), PAGE_MARGIN, 36, { characterSpacing: 1 });
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`${config.docTitle} · documento ejecutivo`, PAGE_WIDTH - PAGE_MARGIN - 260, 36, {
            width: 260,
            align: "right",
        });
    doc.rect(PAGE_MARGIN, 50, CONTENT_WIDTH, 0.75).fillColor(COLOR.line).fill();
};

const drawInternalFooter = (
    doc: PDFKit.PDFDocument,
    page: number,
    total: number,
    appName: string,
    _config: PdfDocumentConfig,
): void => {
    const y = PAGE_HEIGHT - PAGE_MARGIN + 12;
    doc.rect(PAGE_MARGIN, y - 6, CONTENT_WIDTH, 0.75).fillColor(COLOR.line).fill();
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`${appName}  ·  Confidencial`, PAGE_MARGIN, y, { width: 220 });
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`Página ${page} de ${total}`, PAGE_WIDTH - PAGE_MARGIN - 100, y, {
            width: 100,
            align: "right",
        });
};

const drawCoverFooter = (doc: PDFKit.PDFDocument, appName: string, config: PdfDocumentConfig): void => {
    const y = PAGE_HEIGHT - PAGE_MARGIN + 12;
    doc.rect(PAGE_MARGIN, y - 6, CONTENT_WIDTH, 0.75).fillColor(COLOR.line).fill();
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`${appName}  ·  ${config.docTitle}`, PAGE_MARGIN, y);
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(`Generado: ${formatDateTime(new Date().toISOString())}`, PAGE_WIDTH - PAGE_MARGIN - 200, y, {
            width: 200,
            align: "right",
        });
};

/* =========================================================================
 *  UTILIDADES
 * ========================================================================= */

const drawSectionTitle = (doc: PDFKit.PDFDocument, title: string): void => {
    if (doc.y + 34 > PAGE_HEIGHT - PAGE_MARGIN) {
        doc.addPage();
    }
    const y = doc.y;
    doc.rect(PAGE_MARGIN, y + 3, 14, 2).fillColor(COLOR.accent).fill();
    doc
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(title.toUpperCase(), PAGE_MARGIN + 22, y, { characterSpacing: 1.2 });
    doc.y = y + 24;
    doc.x = PAGE_MARGIN;
};

const estimateItemHeight = (
    _doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    options: PdfRenderOptions,
): number => {
    const header = 16 + (item.categoryName || item.typeName ? 14 : 0) + 8;
    const meta = 40;
    const desc = item.description ? Math.min(70, Math.ceil(item.description.length / 100) * 13 + 20) : 0;
    const loc = options.includeLocation && item.latitude !== null && item.longitude !== null ? 46 + 100 : 0;
    const ev =
        options.includeImages && item.media.length > 0
            ? 12 +
              item.media.reduce((acc, m) => {
                  if (m.type === "VIDEO") return acc + 24;
                  return acc + 195;
              }, 0)
            : 0;
    return header + meta + desc + loc + ev;
};

const ensureSpace = (doc: PDFKit.PDFDocument, needed: number): void => {
    const bottomLimit = PAGE_HEIGHT - PAGE_MARGIN;
    if (doc.y + needed > bottomLimit) {
        doc.addPage();
    }
};

const IMAGE_FETCH_TIMEOUT_MS = 5000;

/**
 * @description Descarga una imagen remota. Retorna null si falla.
 */
const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
    try {
        const res = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            timeout: IMAGE_FETCH_TIMEOUT_MS,
            maxContentLength: 10 * 1024 * 1024,
        });
        const buf = Buffer.from(res.data);
        if (buf.length === 0) return null;
        return buf;
    } catch {
        return null;
    }
};

/**
 * @description Construye URL de Google Static Maps (zoom 15, vista de calle).
 * El marcador usa `size:small` para no saturar visualmente y `color:emerald`
 * alineado con la paleta del proyecto.
 */
const buildStaticMapUrl = (lat: number, lng: number, width: number, height: number): string | null => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;
    const params = new URLSearchParams({
        center: `${lat},${lng}`,
        zoom: "15",
        size: `${width}x${height}`,
        scale: "1",
        maptype: "roadmap",
        markers: `size:small|color:0x0f766e|${lat},${lng}`,
        key,
    });
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
};

const formatDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "2-digit" });
};

const formatDateTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};
