import axios from "axios";
import PDFDocument from "pdfkit";
import { getConfig } from "@src/core/utils/config";

/**
 * @description Paleta corporativa moderna (Modern Slate & Teal).
 */
const COLOR = {
    ink: "#0f172a",          // Slate 900 (Texto principal)
    graphite: "#334155",     // Slate 700 (Texto secundario)
    muted: "#64748b",        // Slate 500 (Etiquetas y captions)
    faintMuted: "#94a3b8",   // Slate 400
    line: "#e2e8f0",         // Slate 200 (Bordes y separadores)
    cardBg: "#f8fafc",       // Slate 50 (Fondo de tarjetas y bloques)
    paper: "#ffffff",
    accent: "#0d9488",       // Teal 600 (Color institucional primario)
    accentLight: "#ccfbf1",  // Teal 100 (Fondo badges)
    pending: "#d97706",      // Amber 600
    pendingLight: "#fef3c7", // Amber 100
    attended: "#059669",     // Emerald 600
    attendedLight: "#d1fae5",// Emerald 100
} as const;

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_OFFSET = 75;  // Espacio protegido bajo el header en páginas 2+
const FOOTER_OFFSET = 55;  // Espacio protegido antes del footer

export interface PdfMediaItem {
    type: "IMAGE" | "VIDEO";
    url: string;
    key?: string;
}

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

export interface PdfRenderOptions {
    includeImages: boolean;
    includeLocation: boolean;
}

export interface PdfDocumentConfig {
    moduleLabel: string;
    headerEyebrow: string;
    heroTitle: string;
    platformSubtitle: string;
    docTitle: string;
    docKeywords: string;
    filePrefix: string;
    singularNoun: string;
    pluralNoun: string;
    ctaText: string;
    detailSectionTitle: string;
    singularDetailEntity: string;
    pendingLabel: string;
    attendedLabel: string;
}

export const streamModulePdf = async (
    res: import("express").Response,
    items: PdfReportItem[],
    startDate: string,
    endDate: string,
    config: PdfDocumentConfig,
    options: PdfRenderOptions,
): Promise<void> => {
    let appName = "CHECK APP";
    try {
        appName = getConfig("APP_NAME");
    } catch {
        /* fallback */
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
        renderSummaryTable(doc, items, config);
        await renderDetailSection(doc, items, options, config);
        applyExecutiveChrome(doc, appName, config);
        doc.end();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error inesperado";

        console.error("Error generando PDF:", error);

        // Si PDFKit ya está conectado al response y comenzó a escribir,
        // NO debemos llamar res.end(), porque PDFKit todavía puede emitir
        // chunks y producir "ERR_STREAM_WRITE_AFTER_END".
        if (!res.headersSent) {
            res.status(500).json({
                data: null,
                success: false,
                messages: [message],
            });
        } else {
            res.destroy(error instanceof Error ? error : undefined);
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

    doc.y = ruleY + 24;
    doc.x = PAGE_MARGIN;

    // Eyebrow badge/tag
    doc
        .fillColor(COLOR.accent)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(config.headerEyebrow.toUpperCase(), { characterSpacing: 1.8 });

    doc
        .moveDown(0.3)
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(26)
        .text(config.heroTitle, { width: CONTENT_WIDTH });

    // Date range with small icon dot
    const dateY = doc.y + 4;
    doc.circle(PAGE_MARGIN + 3, dateY + 4.5, 2.5).fillColor(COLOR.accent).fill();
    doc
        .fillColor(COLOR.graphite)
        .font("Helvetica")
        .fontSize(10)
        .text(`Periodo: ${formatDate(startDate)} — ${formatDate(endDate)}`, PAGE_MARGIN + 12, dateY);

    doc.y = dateY + 22;
    renderKpiCards(doc, items, options, config);

    doc.moveDown(0.8);
    renderExecutiveNarrative(doc, items, options, config);

    doc.moveDown(0.8);
    renderCategoryBreakdown(doc, items, config);

    if (config.ctaText) {
        doc.moveDown(1.2);
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Oblique")
            .fontSize(8)
            .text(config.ctaText, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: "center" });
    }
};

const buildRefCode = (items: PdfReportItem[]): string => {
    const now = new Date();
    const first = items[0]?.id ?? 0;
    const last = items[items.length - 1]?.id ?? 0;
    const hash = ((first * 31 + last) % 9999) + 1;
    return `REP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(hash).padStart(4, "0")}`;
};

const drawMasthead = (
    doc: PDFKit.PDFDocument,
    appName: string,
    refCode: string,
    config: PdfDocumentConfig,
): number => {
    const topY = 36;

    // Logo / Nombre
    doc
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(appName.toUpperCase(), PAGE_MARGIN, topY, { characterSpacing: 1.2 });
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(8.5)
        .text(config.platformSubtitle, PAGE_MARGIN, topY + 18);

    // Meta Header (Derecha)
    doc
        .fillColor(COLOR.graphite)
        .font("Helvetica")
        .fontSize(8)
        .text(`Emitido: ${formatDateTime(new Date().toISOString())}`, PAGE_WIDTH - PAGE_MARGIN - 200, topY + 2, {
            width: 200,
            align: "right",
        });
    doc
        .fillColor(COLOR.accent)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(`REF: ${refCode}`, PAGE_WIDTH - PAGE_MARGIN - 200, topY + 16, {
            width: 200,
            align: "right",
        });

    const ruleY = topY + 36;
    doc.rect(PAGE_MARGIN, ruleY, CONTENT_WIDTH, 1.5).fillColor(COLOR.accent).fill();
    return ruleY;
};

/**
 * KPI Cards con contenedor individual redondeado estilo Dashboard.
 */
const renderKpiCards = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): void => {
    const pending = items.filter((i) => i.status === "PENDING").length;
    const attended = items.filter((i) => i.status === "ATTENDED").length;
    const withMedia = items.filter((i) => i.media.length > 0).length;
    const total = items.length;
    const attendedPct = total > 0 ? Math.round((attended / total) * 100) : 0;

    const cards = [
        { label: "TOTAL REGISTROS", value: String(total), sub: config.pluralNoun, color: COLOR.ink },
        { label: config.pendingLabel.toUpperCase(), value: String(pending), sub: "requieren acción", color: COLOR.pending },
        { label: config.attendedLabel.toUpperCase(), value: String(attended), sub: `${attendedPct}% resueltos`, color: COLOR.attended },
        { label: "EVIDENCIAS", value: String(withMedia), sub: "archivos adjuntos", color: COLOR.accent },
    ];

    const gap = 10;
    const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
    const cardHeight = 64;
    const startY = doc.y;

    cards.forEach((c, idx) => {
        const cardX = PAGE_MARGIN + idx * (cardWidth + gap);

        // Fondo y borde de la tarjeta
        doc.roundedRect(cardX, startY, cardWidth, cardHeight, 6)
            .fillColor(COLOR.cardBg)
            .fillAndStroke(COLOR.cardBg, COLOR.line);

        // Barra indicadora superior
        doc.roundedRect(cardX, startY, cardWidth, 3, 2).fillColor(c.color).fill();

        // Label
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(7)
            .text(c.label, cardX + 10, startY + 12, { width: cardWidth - 20, characterSpacing: 0.8 });

        // Valor
        doc
            .fillColor(COLOR.ink)
            .font("Helvetica-Bold")
            .fontSize(19)
            .text(c.value, cardX + 10, startY + 24, { width: cardWidth - 20 });

        // Subtítulo
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica")
            .fontSize(7.5)
            .text(c.sub, cardX + 10, startY + 48, { width: cardWidth - 20 });
    });

    doc.y = startY + cardHeight + 14;
    doc.x = PAGE_MARGIN;
};

const renderExecutiveNarrative = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): void => {
    drawSectionTitle(doc, "Resumen Ejecutivo");

    if (items.length === 0) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Oblique")
            .fontSize(9.5)
            .text(`No se encontraron registros de ${config.pluralNoun} para los filtros seleccionados.`);
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

    const bullets: string[] = [
        `Se registraron un total de **${total} ${config.singularNoun}${total === 1 ? "" : "es"}**, de las cuales **${attended}** han sido atendidas satisfactoriamente (tasa de resolución del **${resolutionRate}%**).`,
    ];

    if (pending > 0) {
        bullets.push(`Permanecen **${pending} caso(s) pendiente(s)** de atención técnica o administrativa.`);
    } else {
        bullets.push(`Se logró el **100% de atención** en todas las solicitudes del periodo.`);
    }

    if (top.length > 0) {
        const topText = top.map(([name, count]) => `${name} (${count})`).join(", ");
        bullets.push(`Categorías con mayor volumen: ${topText}.`);
    }

    bullets.forEach((b) => {
        const y = doc.y;
        // Icono check/bullet estilizado
        doc.circle(PAGE_MARGIN + 4, y + 4.5, 2.5).fillColor(COLOR.accent).fill();

        // Render simple markdown **negrita**
        const cleanText = b.replace(/\*\*/g, "");
        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica")
            .fontSize(9)
            .text(cleanText, PAGE_MARGIN + 16, y, { width: CONTENT_WIDTH - 16, lineGap: 2 });
        doc.y += 4;
    });
};

const renderCategoryBreakdown = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): void => {
    if (items.length === 0) return;
    drawSectionTitle(doc, "Distribución por Categoría");

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
        .slice(0, 5);

    const startX = PAGE_MARGIN;
    const startY = doc.y;
    const colName = CONTENT_WIDTH * 0.40;
    const colTotal = CONTENT_WIDTH * 0.12;
    const colPending = CONTENT_WIDTH * 0.12;
    const colAttended = CONTENT_WIDTH * 0.12;
    const colBar = CONTENT_WIDTH - colName - colTotal - colPending - colAttended;
    const rowHeight = 22;

    // Header de la tabla pequeña
    doc.rect(startX, startY, CONTENT_WIDTH, 18).fillColor(COLOR.cardBg).fill();
    doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7);
    doc.text("CATEGORÍA", startX + 8, startY + 6, { width: colName - 8, characterSpacing: 0.8 });
    doc.text("TOTAL", startX + colName, startY + 6, { width: colTotal, align: "center", characterSpacing: 0.8 });
    doc.text("PEND.", startX + colName + colTotal, startY + 6, { width: colPending, align: "center", characterSpacing: 0.8 });
    doc.text("ATEND.", startX + colName + colTotal + colPending, startY + 6, { width: colAttended, align: "center", characterSpacing: 0.8 });
    doc.text("PROGRESO", startX + colName + colTotal + colPending + colAttended, startY + 6, { width: colBar - 8, characterSpacing: 0.8 });

    let rowY = startY + 22;
    const total = items.length;
    const maxTotal = Math.max(...rows.map((r) => r[1].total), 1);

    rows.forEach(([name, counts], index) => {
        // Zebra striping muy sutil
        if (index % 2 === 1) {
            doc.rect(startX, rowY - 2, CONTENT_WIDTH, rowHeight).fillColor(COLOR.faintMuted).fillOpacity(0.06).fill();
            doc.fillOpacity(1); // reset opacity
        }

        doc.fillColor(COLOR.ink).font("Helvetica").fontSize(8.5).text(name, startX + 8, rowY + 3, { width: colName - 12 });
        doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(8.5).text(String(counts.total), startX + colName, rowY + 3, { width: colTotal, align: "center" });
        doc.fillColor(COLOR.pending).font("Helvetica-Bold").fontSize(8.5).text(String(counts.pending), startX + colName + colTotal, rowY + 3, { width: colPending, align: "center" });
        doc.fillColor(COLOR.attended).font("Helvetica-Bold").fontSize(8.5).text(String(counts.attended), startX + colName + colTotal + colPending, rowY + 3, { width: colAttended, align: "center" });

        // Barra de progreso redondeada con porcentaje dinámico
        const pct = total > 0 ? Math.round((counts.total / total) * 100) : 0;
        const barX = startX + colName + colTotal + colPending + colAttended;
        const barY = rowY + 6;
        const pctTextW = 24;
        const barMaxWidth = colBar - 12 - pctTextW;
        doc.roundedRect(barX, barY, barMaxWidth, 5, 2.5).fillColor(COLOR.line).fill();

        const fillW = Math.max((counts.total / maxTotal) * barMaxWidth, 4);
        doc.roundedRect(barX, barY, fillW, 5, 2.5).fillColor(COLOR.accent).fill();

        doc
            .fillColor(COLOR.graphite)
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .text(`${pct}%`, barX + barMaxWidth + 4, barY - 3, { width: pctTextW, characterSpacing: 0.4 });

        rowY += rowHeight;
    });

    doc.y = rowY + 6;
    doc.x = PAGE_MARGIN;
};

/* =========================================================================
 *  RESUMEN GENERAL (TABLA CON MEJOR PAGINACIÓN)
 * ========================================================================= */

const renderSummaryTable = (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): void => {
    if (items.length === 0) return;

    doc.addPage();
    doc.y = HEADER_OFFSET;
    drawSectionTitle(doc, "Resumen General de Registros");

    const startX = PAGE_MARGIN;
    const colIdx = 28;
    const colDate = 70;
    const colTime = 48;
    const colUser = 130;
    const colType = 125;
    const colStatus = CONTENT_WIDTH - colIdx - colDate - colTime - colUser - colType;
    const rowHeight = 24;

    const drawHeaders = (y: number): void => {
        doc.rect(startX, y, CONTENT_WIDTH, 18).fillColor(COLOR.cardBg).fill();
        doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7);
        doc.text("#", startX + 6, y + 5, { width: colIdx - 8 });
        doc.text("FECHA", startX + colIdx, y + 5, { width: colDate });
        doc.text("HORA", startX + colIdx + colDate, y + 5, { width: colTime });
        doc.text("USUARIO", startX + colIdx + colDate + colTime, y + 5, { width: colUser });
        doc.text("TIPO / CATEGORÍA", startX + colIdx + colDate + colTime + colUser, y + 5, { width: colType });
        doc.text("ESTADO", startX + colIdx + colDate + colTime + colUser + colType, y + 5, { width: colStatus, align: "right" });
    };

    let rowY = doc.y;
    drawHeaders(rowY);
    rowY += 22;

    items.forEach((item, idx) => {
        if (rowY + rowHeight > PAGE_HEIGHT - FOOTER_OFFSET) {
            doc.addPage();
            rowY = HEADER_OFFSET;
            drawHeaders(rowY);
            rowY += 22;
        }

        const d = new Date(item.createdAt);
        const dateStr = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
        const timeStr = Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

        const userName = (item.guardName || item.guardUsername || "—").trim();
        const typeName = (item.typeName ?? item.categoryName ?? "General").trim();
        const attended = item.status === "ATTENDED";
        const statusLabel = attended ? config.attendedLabel : config.pendingLabel;
        const statusColor = attended ? COLOR.attended : COLOR.pending;

        // Fila zebra
        if (idx % 2 === 1) {
            doc.rect(startX, rowY - 2, CONTENT_WIDTH, rowHeight).fillColor(COLOR.cardBg).fill();
        }

        doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8).text(String(idx + 1).padStart(2, "0"), startX + 6, rowY + 4, { width: colIdx - 8 });
        doc.fillColor(COLOR.graphite).font("Helvetica").fontSize(8).text(dateStr, startX + colIdx, rowY + 4, { width: colDate });
        doc.text(timeStr, startX + colIdx + colDate, rowY + 4, { width: colTime });
        doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(8).text(userName, startX + colIdx + colDate + colTime, rowY + 4, { width: colUser - 10, lineBreak: false });
        doc.fillColor(COLOR.graphite).font("Helvetica").fontSize(8).text(typeName, startX + colIdx + colDate + colTime + colUser, rowY + 4, { width: colType - 10, lineBreak: false });

        // Status Badge en miniatura
        const badgeW = 64;
        const badgeH = 14;
        const badgeX = startX + CONTENT_WIDTH - badgeW;
        const badgeY = rowY + 2;
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3)
            .fillColor(attended ? COLOR.attendedLight : COLOR.pendingLight)
            .fill();
        doc.fillColor(statusColor)
            .font("Helvetica-Bold")
            .fontSize(7)
            .text(statusLabel, badgeX, badgeY + 3.5, { width: badgeW, align: "center" });

        rowY += rowHeight;
    });

    doc.y = rowY + 10;
};

/* =========================================================================
 *  DETALLE DE REGISTROS (TARJETAS INDEPENDIENTES)
 * ========================================================================= */

const renderDetailSection = async (
    doc: PDFKit.PDFDocument,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): Promise<void> => {
    doc.addPage();
    doc.y = HEADER_OFFSET;
    drawSectionTitle(doc, config.detailSectionTitle);

    if (items.length === 0) {
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Oblique")
            .fontSize(10)
            .text(`No se encontraron ${config.pluralNoun} para mostrar en el detalle.`, { align: "center" });
        return;
    }

    for (let index = 0; index < items.length; index++) {
        await renderItemCard(doc, items[index], index + 1, options, config);
    }
};

const renderItemCard = async (
    doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    index: number,
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): Promise<void> => {
    const estimatedHeight = estimateItemHeight(doc, item, options);
    ensureSpace(doc, estimatedHeight + 8);

    const x = PAGE_MARGIN;
    const startY = doc.y;
    const isAttended = item.status === "ATTENDED";
    const statusColor = isAttended ? COLOR.attended : COLOR.pending;
    const statusBg = isAttended ? COLOR.attendedLight : COLOR.pendingLight;
    const statusLabel = isAttended ? config.attendedLabel : config.pendingLabel;

    // Encabezado de la tarjeta
    doc.roundedRect(x, startY, 26, 18, 4).fillColor(COLOR.cardBg).fill();
    doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(8).text(`#${String(index).padStart(2, "0")}`, x, startY + 5, { width: 26, align: "center" });

    // Título
    doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(11).text(item.title, x + 34, startY + 3, { width: CONTENT_WIDTH - 34 - 90 });

    // Badge de estado a la derecha
    const badgeW = 80;
    const badgeH = 18;
    const badgeX = x + CONTENT_WIDTH - badgeW;
    doc.roundedRect(badgeX, startY + 1, badgeW, badgeH, 4).fillColor(statusBg).fill();
    doc.fillColor(statusColor).font("Helvetica-Bold").fontSize(7.5).text(statusLabel, badgeX, startY + 5.5, { width: badgeW, align: "center" });

    let cursorY = startY + 24;

    // Tags de categoría / tipo
    if (item.categoryName || item.typeName) {
        const chips = [item.categoryName, item.typeName].filter(Boolean).join("  •  ");
        doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8).text(chips, x + 34, cursorY);
        cursorY += 14;
    }

    cursorY += 4;
    cursorY = renderMetaGrid(doc, item, x, cursorY, CONTENT_WIDTH);
    cursorY += 8;

    // Descripción
    if (item.description) {
        doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7).text("DESCRIPCIÓN", x, cursorY, { characterSpacing: 0.8 });
        cursorY += 10;
        doc.fillColor(COLOR.graphite).font("Helvetica").fontSize(8.5).text(item.description, x, cursorY, { width: CONTENT_WIDTH, lineGap: 2 });
        cursorY = doc.y + 8;
    }

    // Ubicación GPS + Mapa
    if (options.includeLocation && item.latitude !== null && item.longitude !== null) {
        cursorY = await renderLocationBlock(doc, item.latitude, item.longitude, x, cursorY, CONTENT_WIDTH);
    }

    // Evidencias (Fotos / Videos)
    if (options.includeImages && item.media.length > 0) {
        doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7).text(`EVIDENCIA ADJUNTA (${item.media.length})`, x, cursorY, { characterSpacing: 0.8 });
        cursorY += 12;
        for (const m of item.media) {
            cursorY = await renderEvidenceLine(doc, m, x, cursorY, CONTENT_WIDTH);
        }
    }

    // Línea divisoria inferior
    cursorY = ensureSpaceAt(doc, cursorY, 12);
    doc.rect(x, cursorY + 4, CONTENT_WIDTH, 0.75).fillColor(COLOR.line).fill();
    doc.y = cursorY + 16;
    doc.x = PAGE_MARGIN;
};

const renderMetaGrid = (
    doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    x: number,
    y: number,
    width: number,
): number => {
    const fields: Array<{ label: string; value: string }> = [
        { label: "FECHA / HORA", value: formatDateTime(item.createdAt.toISOString()) },
        { label: "REPORTADO POR", value: item.guardName || item.guardUsername || "—" },
        { label: "ID SISTEMA", value: `#${item.id}` },
    ];
    if (item.status === "ATTENDED" && item.resolvedByName) {
        fields.push({
            label: "ATENDIDO POR",
            value: `${item.resolvedByName}${item.resolvedAt ? " (" + formatDateTime(item.resolvedAt.toISOString()) + ")" : ""}`,
        });
    }

    const colW = width / fields.length;

    // Caja contenedora de metadatos
    doc.roundedRect(x, y, width, 32, 4).fillColor(COLOR.cardBg).fill();

    fields.forEach((f, idx) => {
        const colX = x + idx * colW + 8;
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text(f.label, colX, y + 6, { width: colW - 12, characterSpacing: 0.6 });
        doc
            .fillColor(COLOR.ink)
            .font("Helvetica")
            .fontSize(8)
            .text(f.value, colX, y + 17, { width: colW - 12, lineBreak: false });
    });

    return y + 36;
};

/* =========================================================================
 *  UBICACIÓN (MAPA + BOTÓN)
 * ========================================================================= */

/**
 * @description Renderiza el bloque de ubicación: coordenadas, mapa estático
 * (o placeholder con pin si no hay API key / falla la descarga) y un botón
 * tipo "pill" para abrir la ubicación en Google Maps. Usa una posición `y`
 * explícita en vez de depender de `doc.y`, para que el flujo del layout no
 * se desincronice tras un salto de página.
 */
const renderLocationBlock = async (
    doc: PDFKit.PDFDocument,
    lat: number,
    lng: number,
    x: number,
    y: number,
    width: number,
): Promise<number> => {
    y = ensureSpaceAt(doc, y, 40);

    doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(7).text("UBICACIÓN REGISTRADA", x, y, { characterSpacing: 0.8 });
    y += 11;
    doc
        .fillColor(COLOR.graphite)
        .font("Helvetica")
        .fontSize(8)
        .text(`Lat ${lat.toFixed(6)}   Lng ${lng.toFixed(6)}`, x, y, { width });
    y += 14;

    const mapHeight = 100;
    const staticUrl = buildStaticMapUrl(lat, lng, Math.round(width * 2), Math.round(mapHeight * 2));

    let mapRendered = false;
    if (staticUrl) {
        y = ensureSpaceAt(doc, y, mapHeight + 30);
        const mapBuf = await fetchImageBuffer(staticUrl);
        if (mapBuf) {
            try {
                doc.save();
                doc.roundedRect(x, y, width, mapHeight, 8).clip();
                doc.image(mapBuf, x, y, { fit: [width, mapHeight], align: "center", valign: "center" });
                doc.restore();
                doc.roundedRect(x, y, width, mapHeight, 8).lineWidth(0.75).strokeColor(COLOR.line).stroke();
                y += mapHeight + 10;
                mapRendered = true;
            } catch {
                /* cae al placeholder abajo */
            }
        }
    }

    if (!mapRendered) {
        const placeholderHeight = 44;
        y = ensureSpaceAt(doc, y, placeholderHeight + 20);
        doc.roundedRect(x, y, width, placeholderHeight, 6).fillColor(COLOR.cardBg).fill();
        drawPinIcon(doc, x + 24, y + placeholderHeight / 2, 8, COLOR.accent);
        doc
            .fillColor(COLOR.muted)
            .font("Helvetica")
            .fontSize(8)
            .text("Vista previa de mapa no disponible", x + 44, y + placeholderHeight / 2 - 5, { width: width - 60 });
        y += placeholderHeight + 10;
    }

    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    y = drawLinkPill(doc, x, y, "Abrir en Google Maps", mapsUrl, COLOR.accent, COLOR.accentLight);
    return y + 10;
};

/* =========================================================================
 *  EVIDENCIA (FOTO / VIDEO)
 * ========================================================================= */

const renderEvidenceLine = async (
    doc: PDFKit.PDFDocument,
    item: PdfMediaItem,
    x: number,
    y: number,
    width: number,
): Promise<number> => {
    if (item.type === "VIDEO") {
        return renderVideoEvidence(doc, item, x, y, width);
    }
    return renderImageEvidence(doc, item, x, y, width);
};

const renderVideoEvidence = (
    doc: PDFKit.PDFDocument,
    item: PdfMediaItem,
    x: number,
    y: number,
    width: number,
): number => {
    const cardHeight = 46;
    y = ensureSpaceAt(doc, y, cardHeight + 12);

    doc.roundedRect(x, y, width, cardHeight, 6).fillColor(COLOR.cardBg).fill();

    // Icono de play dibujado (evita depender de glifos Unicode que no
    // siempre existen en Helvetica y se ven como un cuadro vacío).
    const iconCx = x + 26;
    const iconCy = y + cardHeight / 2;
    doc.circle(iconCx, iconCy, 12).fillColor(COLOR.accentLight).fill();
    drawPlayIcon(doc, iconCx, iconCy, 6, COLOR.accent);

    doc
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text("Video adjunto", x + 48, y + 10, { width: width - 140 });
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(item.url, x + 48, y + 23, { width: width - 140 });

    drawLinkPill(doc, x + width - 108, y + (cardHeight - 20) / 2, "Reproducir", item.url, COLOR.accent, COLOR.accentLight, 108);

    return y + cardHeight + 10;
};

const renderImageEvidence = async (
    doc: PDFKit.PDFDocument,
    item: PdfMediaItem,
    x: number,
    y: number,
    width: number,
): Promise<number> => {
    const imgHeight = 150;
    y = ensureSpaceAt(doc, y, imgHeight + 26);

    const buffer = await fetchImageBuffer(item.url);
    if (buffer) {
        try {
            doc.save();
            doc.roundedRect(x, y, width, imgHeight, 6).clip();
            doc.roundedRect(x, y, width, imgHeight, 6).fillColor(COLOR.cardBg).fill();
            doc.image(buffer, x, y, { fit: [width, imgHeight], align: "center", valign: "center" });
            doc.restore();
            doc.roundedRect(x, y, width, imgHeight, 6).lineWidth(0.75).strokeColor(COLOR.line).stroke();

            doc
                .fillColor(COLOR.muted)
                .font("Helvetica")
                .fontSize(7.5)
                .text(item.url, x, y + imgHeight + 4, { width, link: item.url, underline: true });

            return y + imgHeight + 18;
        } catch {
            /* cae al fallback */
        }
    }

    // Fallback si la imagen no descarga
    const fallbackHeight = 40;
    doc.roundedRect(x, y, width, fallbackHeight, 6).fillColor(COLOR.cardBg).fill();
    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("Imagen no disponible", x + 14, y + 12, { width: width - 130 });
    drawLinkPill(doc, x + width - 108, y + (fallbackHeight - 20) / 2, "Ver original", item.url, COLOR.accent, COLOR.accentLight, 108);

    return y + fallbackHeight + 10;
};

/* =========================================================================
 *  CHROME (HEADER & FOOTER)
 * ========================================================================= */

const applyExecutiveChrome = (
    doc: PDFKit.PDFDocument,
    appName: string,
    config: PdfDocumentConfig,
): void => {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Los elementos de header/footer se dibujan con coordenadas absolutas
        // y save/restore para NO modificar el cursor de contenido (doc.y).
        if (i === range.start) {
            drawCoverFooter(doc, appName, config);
        } else {
            drawInternalHeader(doc, appName, config);
            drawInternalFooter(
                doc,
                i - range.start + 1,
                range.count,
                appName,
            );
        }
    }
};

const drawInternalHeader = (
    doc: PDFKit.PDFDocument,
    appName: string,
    config: PdfDocumentConfig,
): void => {
    doc.save();

    const headerY = 30;

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text(
            appName.toUpperCase(),
            PAGE_MARGIN,
            headerY,
            {
                width: 180,
                characterSpacing: 1,
                lineBreak: false,
            },
        );

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
            config.docTitle,
            PAGE_WIDTH - PAGE_MARGIN - 250,
            headerY,
            {
                width: 250,
                align: "right",
                lineBreak: false,
            },
        );

    doc
        .rect(PAGE_MARGIN, 44, CONTENT_WIDTH, 0.75)
        .fillColor(COLOR.line)
        .fill();

    doc.restore();
};

const drawInternalFooter = (
    doc: PDFKit.PDFDocument,
    page: number,
    total: number,
    appName: string,
): void => {
    doc.save();

    // El footer debe quedar DENTRO del área imprimible.
    // Con bottom margin = 48, el límite inferior es:
    // 841.89 - 48 = 793.89
    //
    // Antes se utilizaba 841.89 - 36 = 805.89, provocando que PDFKit
    // interpretara el texto como contenido fuera del área y agregara
    // páginas en blanco.
    const footerY = PAGE_HEIGHT - PAGE_MARGIN - 10;

    doc
        .rect(
            PAGE_MARGIN,
            footerY - 9,
            CONTENT_WIDTH,
            0.75,
        )
        .fillColor(COLOR.line)
        .fill();

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
            `${appName}  •  Documento Confidencial`,
            PAGE_MARGIN,
            footerY,
            {
                width: 250,
                lineBreak: false,
            },
        );

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
            `Página ${page} de ${total}`,
            PAGE_WIDTH - PAGE_MARGIN - 100,
            footerY,
            {
                width: 100,
                align: "right",
                lineBreak: false,
            },
        );

    doc.restore();
};

const drawCoverFooter = (
    doc: PDFKit.PDFDocument,
    appName: string,
    config: PdfDocumentConfig,
): void => {
    doc.save();

    const footerY = PAGE_HEIGHT - PAGE_MARGIN - 10;

    doc
        .rect(
            PAGE_MARGIN,
            footerY - 9,
            CONTENT_WIDTH,
            0.75,
        )
        .fillColor(COLOR.line)
        .fill();

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
            `${appName}  •  ${config.docTitle}`,
            PAGE_MARGIN,
            footerY,
            {
                width: 250,
                lineBreak: false,
            },
        );

    doc
        .fillColor(COLOR.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(
            `Generado: ${formatDateTime(new Date().toISOString())}`,
            PAGE_WIDTH - PAGE_MARGIN - 200,
            footerY,
            {
                width: 200,
                align: "right",
                lineBreak: false,
            },
        );

    doc.restore();
};

/* =========================================================================
 *  UTILIDADES Y HELPERS DE RENDERIZADO
 * ========================================================================= */

const drawSectionTitle = (doc: PDFKit.PDFDocument, title: string): void => {
    ensureSpace(doc, 36);
    const y = doc.y;
    doc.rect(PAGE_MARGIN, y, 3, 12).fillColor(COLOR.accent).fill();
    doc
        .fillColor(COLOR.ink)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(title, PAGE_MARGIN + 8, y + 1);
    doc.y += 10;
};

const ensureSpace = (
    doc: PDFKit.PDFDocument,
    neededHeight: number,
): void => {
    if (doc.y + neededHeight > PAGE_HEIGHT - FOOTER_OFFSET) {
        doc.addPage();
        doc.x = PAGE_MARGIN;
        doc.y = HEADER_OFFSET;
    }
};

/**
 * @description Variante de `ensureSpace` que trabaja sobre una posición `y`
 * explícita (no sobre `doc.y`) y devuelve la posición ya corregida. Se usa
 * en los bloques de mapa y evidencia para que el flujo de layout nunca se
 * desincronice del cursor real de PDFKit tras un salto de página.
 */
const ensureSpaceAt = (
    doc: PDFKit.PDFDocument,
    y: number,
    neededHeight: number,
): number => {
    if (y + neededHeight > PAGE_HEIGHT - FOOTER_OFFSET) {
        doc.addPage();
        doc.x = PAGE_MARGIN;
        doc.y = HEADER_OFFSET;
        return HEADER_OFFSET;
    }

    return y;
};

/**
 * @description Dibuja un botón tipo "pill" con fondo tenue y área clicable
 * (`doc.link`), usado para "Abrir en Google Maps" / "Reproducir video".
 * Reemplaza el patrón anterior de texto inline con `continued: true`
 * mezclando fuentes, que se veía desalineado.
 */
const drawLinkPill = (
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    label: string,
    url: string,
    color: string,
    bg: string,
    fixedWidth?: number,
): number => {
    const height = 20;
    const paddingX = 10;
    doc.font("Helvetica-Bold").fontSize(7.5);
    const textWidth = doc.widthOfString(label);
    const width = fixedWidth ?? textWidth + paddingX * 2 + 12;

    doc.roundedRect(x, y, width, height, height / 2).fillColor(bg).fill();
    doc
        .fillColor(color)
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text(label, x, y + 6.5, { width: width - 14, align: "center", characterSpacing: 0.3 });
    drawExternalLinkIcon(doc, x + width - 12, y + height / 2, 3.5, color);

    doc.link(x, y, width, height, url);
    return y + height;
};

/**
 * @description Icono de "abrir enlace externo" dibujado con líneas, sin
 * depender de glifos Unicode.
 */
const drawExternalLinkIcon = (doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void => {
    doc
        .save()
        .lineWidth(1)
        .strokeColor(color)
        .rect(cx - size / 2, cy - size / 2 + 1, size * 0.75, size * 0.75)
        .stroke()
        .moveTo(cx - size / 4, cy - size / 2)
        .lineTo(cx + size / 2, cy - size / 2)
        .lineTo(cx + size / 2, cy + size / 4)
        .stroke()
        .restore();
};

/**
 * @description Triángulo de "play" dibujado como vector, centrado en (cx,cy).
 */
const drawPlayIcon = (doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void => {
    doc
        .save()
        .moveTo(cx - size * 0.5, cy - size * 0.65)
        .lineTo(cx - size * 0.5, cy + size * 0.65)
        .lineTo(cx + size * 0.75, cy)
        .closePath()
        .fillColor(color)
        .fill()
        .restore();
};

/**
 * @description Pin de ubicación dibujado como vector (círculo + gota),
 * usado en el placeholder cuando no hay preview de mapa disponible.
 */
const drawPinIcon = (doc: PDFKit.PDFDocument, cx: number, cy: number, size: number, color: string): void => {
    doc.save();
    doc
        .moveTo(cx, cy + size)
        .quadraticCurveTo(cx - size, cy - size * 0.2, cx, cy - size)
        .quadraticCurveTo(cx + size, cy - size * 0.2, cx, cy + size)
        .closePath()
        .fillColor(color)
        .fill();
    doc.circle(cx, cy - size * 0.15, size * 0.35).fillColor(COLOR.paper).fill();
    doc.restore();
};

const estimateItemHeight = (
    doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    options: PdfRenderOptions,
): number => {
    // Estimación conservadora. No debe reservar espacio de más porque eso
    // provoca saltos de página antes de tiempo.
    let height = 72;

    if (item.description) {
        const descriptionHeight = doc.heightOfString(item.description, {
            width: CONTENT_WIDTH,
            lineGap: 2,
        });

        height += Math.min(descriptionHeight, 120) + 16;
    }

    if (
        options.includeLocation &&
        item.latitude !== null &&
        item.longitude !== null
    ) {
        // Coordenadas + mapa/placeholder + enlace.
        height += 145;
    }

    if (options.includeImages && item.media.length > 0) {
        height += item.media.reduce(
            (acc, media) => acc + (media.type === "VIDEO" ? 58 : 172),
            10,
        );
    }

    return height;
};

const formatDate = (dStr: string): string => {
    const d = new Date(dStr);
    return Number.isNaN(d.getTime()) ? dStr : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTime = (dStr: string): string => {
    const d = new Date(dStr);
    return Number.isNaN(d.getTime())
        ? dStr
        : `${d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

/**
 * @description Construye la URL de Google Static Maps. Requiere la
 * variable de entorno `GOOGLE_MAPS_API_KEY`. Si no está configurada,
 * retorna `null` y el llamador usa el placeholder con pin.
 */
const buildStaticMapUrl = (lat: number, lng: number, width: number, height: number): string | null => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;
    const params = new URLSearchParams({
        center: `${lat},${lng}`,
        zoom: "16",
        size: `${Math.min(width, 1280)}x${Math.min(height, 1280)}`,
        scale: "2",
        maptype: "roadmap",
        markers: `size:mid|color:0x0d9488|${lat},${lng}`,
        key,
    });
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
};

const IMAGE_FETCH_TIMEOUT_MS = 5000;

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
    try {
        const response = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            timeout: IMAGE_FETCH_TIMEOUT_MS,
            maxContentLength: 10 * 1024 * 1024,
        });
        const buf = Buffer.from(response.data);
        if (buf.length === 0) return null;
        return buf;
    } catch {
        return null;
    }
};
