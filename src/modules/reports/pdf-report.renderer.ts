import fs from "fs";
import path from "path";
import axios from "axios";
import PDFDocument from "pdfkit";
import { getConfig } from "@src/core/utils/config";

/* =========================================================================
 *  SISTEMA DE DISEÑO — mismo lenguaje visual del dashboard de CheckApp:
 *  tarjetas blancas con borde suave y radio grande, etiquetas en mayúsculas
 *  con tracking, números grandes en negrita, pastillas de estado, filas de
 *  alerta con tinte y botones verdes.
 * ========================================================================= */

const COLOR = {
    ink: "#0f172a",
    text: "#334155",
    muted: "#64748b",
    faint: "#94a3b8",
    line: "#e2e8f0",
    wash: "#f8fafc",
    paper: "#ffffff",
    accent: "#065911", // Verde CheckApp (botones, "App")
    accentDark: "#0b3d17", // Insignia de fecha
    accentSoft: "#dcfce7",
    pending: "#b45309",
    pendingBg: "#fef3c7",
    attended: "#047857",
    attendedBg: "#d1fae5",
    // Alertas (igual que "Ahora mismo")
    redFg: "#dc2626",
    redBg: "#fef2f2",
    redBorder: "#fecaca",
    amberFg: "#d97706",
    amberBg: "#fefce8",
    amberBorder: "#fde68a",
    // Iconos de KPI
    blueFg: "#0284c7",
    blueBg: "#e0f2fe",
    purpleFg: "#7c3aed",
    purpleBg: "#f3e8ff",
} as const;

/**
 * Tipografías. Por defecto Helvetica (incluida en PDFKit). Si colocas los
 * archivos de la tipografía de tu app (p. ej. Plus Jakarta Sans / Inter) en
 * `assets/fonts/brand-regular.ttf` y `assets/fonts/brand-bold.ttf` (o apuntas
 * `REPORT_FONT_REGULAR` / `REPORT_FONT_BOLD`), se usan automáticamente.
 */
const F = { regular: "Helvetica", bold: "Helvetica-Bold", mono: "Courier-Bold" };

const FONT_REGULAR_PATH =
    process.env.REPORT_FONT_REGULAR ?? path.resolve(process.cwd(), "assets/fonts/brand-regular.ttf");
const FONT_BOLD_PATH = process.env.REPORT_FONT_BOLD ?? path.resolve(process.cwd(), "assets/fonts/brand-bold.ttf");
/** Logo opcional (PNG). Si no existe se dibuja solo el wordmark. */
const LOGO_PATH = process.env.REPORT_LOGO_PATH ?? path.resolve(process.cwd(), "assets/logo.png");

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_OFFSET = 80; // Inicio del contenido en páginas 2+
const CONTENT_BOTTOM = PAGE_HEIGHT - 66;

const RADIUS = 12;
const CARD_PAD = 18;
const CARD_GAP = 14;

/** "cover" recorta para llenar la celda; "contain" muestra la foto completa. */
const IMAGE_FIT = "cover" as "cover" | "contain";
const PHOTO_COLUMNS = 4;
const PHOTO_GAP = 8;
const PHOTO_HEIGHT = 116;

/** Zona horaria para fechas/horas (evita depender de la zona del servidor). */
const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE ?? "America/Tijuana";

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

/* =========================================================================
 *  PUNTO DE ENTRADA
 * ========================================================================= */

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
            Subject: `${config.moduleLabel} del ${formatFilterDate(startDate)} al ${formatFilterDate(endDate)}`,
            Keywords: config.docKeywords,
        },
    });

    registerBrandFonts(doc);

    const filename = `${config.filePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    try {
        const refCode = buildRefCode(items);

        let y = renderCover(doc, refCode, startDate, endDate, items, config);
        y = renderSummaryTable(doc, y, items, config);
        await renderDetailSection(doc, y, items, options, config);

        applyChrome(doc, refCode);
        doc.end();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        console.error("Error generando PDF:", error);

        if (!res.headersSent) {
            res.status(500).json({ data: null, success: false, messages: [message] });
        } else {
            res.destroy(error instanceof Error ? error : undefined);
        }
    }
};

const registerBrandFonts = (doc: PDFKit.PDFDocument): void => {
    try {
        if (fs.existsSync(FONT_REGULAR_PATH) && fs.existsSync(FONT_BOLD_PATH)) {
            doc.registerFont("Brand", FONT_REGULAR_PATH);
            doc.registerFont("Brand-Bold", FONT_BOLD_PATH);
            F.regular = "Brand";
            F.bold = "Brand-Bold";
        } else {
            F.regular = "Helvetica";
            F.bold = "Helvetica-Bold";
        }
    } catch {
        F.regular = "Helvetica";
        F.bold = "Helvetica-Bold";
    }
};

/* =========================================================================
 *  PORTADA
 * ========================================================================= */

const renderCover = (
    doc: PDFKit.PDFDocument,
    refCode: string,
    startDate: string,
    endDate: string,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): number => {
    let y = drawMasthead(doc, config);

    y = renderHeroCard(doc, y + 16, refCode, startDate, endDate, config);
    y = renderKpiCards(doc, y + CARD_GAP, items, config);
    y = renderSummaryCard(doc, y + CARD_GAP, items, config);

    if (items.some((i) => i.status === "PENDING")) {
        y = renderAlertsCard(doc, y + CARD_GAP, items, config);
    }
    if (items.length > 0) {
        y = renderCategoryCard(doc, y + CARD_GAP, items);
    }

    if (config.ctaText) {
        y = ensure(doc, y + 16, 24);
        doc
            .font(F.regular)
            .fontSize(8)
            .fillColor(COLOR.muted)
            .text(config.ctaText, PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
        y = doc.y;
    }

    return y;
};

const buildRefCode = (items: PdfReportItem[]): string => {
    const now = new Date();
    const first = items[0]?.id ?? 0;
    const last = items[items.length - 1]?.id ?? 0;
    const hash = ((first * 31 + last) % 9999) + 1;
    return `REP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(hash).padStart(4, "0")}`;
};

const drawMasthead = (doc: PDFKit.PDFDocument, config: PdfDocumentConfig): number => {
    const y = 32;
    let tx = PAGE_MARGIN;

    if (fs.existsSync(LOGO_PATH)) {
        try {
            doc.image(LOGO_PATH, PAGE_MARGIN, y - 3, { fit: [26, 26] });
            tx += 34;
        } catch {
            /* sin logo */
        }
    }

    drawWordmark(doc, tx, y, 17);

    doc
        .font(F.regular)
        .fontSize(8)
        .fillColor(COLOR.muted)
        .text(config.platformSubtitle, PAGE_WIDTH - PAGE_MARGIN - 240, y + 6, {
            width: 240,
            align: "right",
            lineBreak: false,
        });

    const ruleY = y + 34;
    hr(doc, PAGE_MARGIN, ruleY, CONTENT_WIDTH, COLOR.line, 0.75);
    return ruleY;
};

/** Wordmark bicolor: "Check" en tinta + "App" en verde. */
const drawWordmark = (doc: PDFKit.PDFDocument, x: number, y: number, size: number): void => {
    doc.font(F.bold).fontSize(size);
    const w = doc.widthOfString("Check");
    doc.fillColor(COLOR.ink).text("Check", x, y, { lineBreak: false });
    doc.fillColor(COLOR.accent).text("App", x + w, y, { lineBreak: false });
};

/** Tarjeta principal: insignia de fecha + título + referencia (como el saludo del dashboard). */
const renderHeroCard = (
    doc: PDFKit.PDFDocument,
    y: number,
    refCode: string,
    startDate: string,
    endDate: string,
    config: PdfDocumentConfig,
): number => {
    const x = PAGE_MARGIN;
    const h = 86;
    card(doc, x, y, CONTENT_WIDTH, h);

    // Insignia de fecha (fecha de corte)
    const end = new Date(endDate);
    const valid = !Number.isNaN(end.getTime());
    const month = valid ? end.toLocaleDateString("es-MX", { month: "short" }).replace(".", "").toUpperCase() : "—";
    const day = valid ? String(end.getDate()) : "—";
    const year = valid ? String(end.getFullYear()) : "";

    const bx = x + 16;
    const by = y + 15;
    doc.roundedRect(bx, by, 56, 56, 14).fillColor(COLOR.accentDark).fill();
    doc
        .font(F.bold)
        .fontSize(6.5)
        .fillColor("#bbf7d0")
        .text(month, bx, by + 9, { width: 56, align: "center", characterSpacing: 1.2, lineBreak: false });
    doc.font(F.bold).fontSize(22).fillColor(COLOR.paper).text(day, bx, by + 19, { width: 56, align: "center", lineBreak: false });
    doc
        .font(F.bold)
        .fontSize(6.5)
        .fillColor("#bbf7d0")
        .text(year, bx, by + 44, { width: 56, align: "center", characterSpacing: 1, lineBreak: false });

    // Título
    const tx = bx + 56 + 18;
    label(doc, config.headerEyebrow, tx, y + 17, 260, COLOR.accent);
    doc.font(F.bold).fontSize(21).fillColor(COLOR.ink).text(config.heroTitle, tx, y + 30, { width: 300, lineBreak: false });
    doc
        .font(F.regular)
        .fontSize(8.5)
        .fillColor(COLOR.muted)
        .text(`Periodo: ${formatFilterDate(startDate)} — ${formatFilterDate(endDate)}`, tx, y + 58, { lineBreak: false });

    // Pastillas de referencia (derecha)
    const rightEdge = x + CONTENT_WIDTH - 16;
    const emitted = `Emitido ${formatDateTime(new Date())}`;
    const w1 = pillWidth(doc, emitted, { size: 6.8, spacing: 0.2 });
    pill(doc, rightEdge - w1, y + 18, emitted, COLOR.muted, COLOR.wash, { size: 6.8, spacing: 0.2, border: COLOR.line });
    const refText = `REF ${refCode}`;
    const w2 = pillWidth(doc, refText, { size: 6.8, spacing: 0.6 });
    pill(doc, rightEdge - w2, y + 42, refText, COLOR.accent, COLOR.accentSoft, { size: 6.8, spacing: 0.6 });

    return y + h;
};

const renderKpiCards = (
    doc: PDFKit.PDFDocument,
    y: number,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): number => {
    const total = items.length;
    const pending = items.filter((i) => i.status === "PENDING").length;
    const attended = items.filter((i) => i.status === "ATTENDED").length;
    const totalMedia = items.reduce((acc, i) => acc + i.media.length, 0);
    const withMedia = items.filter((i) => i.media.length > 0).length;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
    const pendingPct = total > 0 ? pending / total : 0;

    type Kpi = {
        label: string;
        value: number;
        sub: string;
        icon: "list" | "warning" | "check" | "image";
        fg: string;
        bg: string;
        bar?: { pct: number; color: string };
    };

    const cards: Kpi[] = [
        { label: "Registros", value: total, sub: config.pluralNoun, icon: "list", fg: COLOR.blueFg, bg: COLOR.blueBg },
        {
            label: config.pendingLabel,
            value: pending,
            sub: "requieren acción",
            icon: "warning",
            fg: COLOR.amberFg,
            bg: COLOR.pendingBg,
            bar: { pct: pendingPct, color: COLOR.amberFg },
        },
        {
            label: config.attendedLabel,
            value: attended,
            sub: `${rate} % de resolución`,
            icon: "check",
            fg: COLOR.attended,
            bg: COLOR.attendedBg,
            bar: { pct: total > 0 ? attended / total : 0, color: COLOR.attended },
        },
        {
            label: "Evidencias",
            value: totalMedia,
            sub: `en ${withMedia} ${withMedia === 1 ? "registro" : "registros"}`,
            icon: "image",
            fg: COLOR.purpleFg,
            bg: COLOR.purpleBg,
        },
    ];

    const gap = 10;
    const w = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
    const h = 94;

    cards.forEach((c, i) => {
        const x = PAGE_MARGIN + i * (w + gap);
        card(doc, x, y, w, h);

        label(doc, fitText(doc, c.label.toUpperCase(), w - 62, 6.3, F.bold, 0.9), x + 16, y + 18, w - 50);

        // Icono en círculo tintado
        const cx = x + w - 24;
        const cy = y + 24;
        doc.circle(cx, cy, 11.5).fillColor(c.bg).fill();
        drawIcon(doc, c.icon, cx, cy, 5.2, c.fg);

        doc.font(F.bold).fontSize(26).fillColor(COLOR.ink).text(String(c.value), x + 16, y + 38, { lineBreak: false });
        doc
            .font(F.regular)
            .fontSize(7.8)
            .fillColor(COLOR.muted)
            .text(fitText(doc, c.sub, w - 32, 7.8, F.regular), x + 16, y + 69, { lineBreak: false });

        if (c.bar) {
            const bw = w - 32;
            doc.roundedRect(x + 16, y + h - 12, bw, 3.5, 1.75).fillColor(COLOR.line).fill();
            if (c.bar.pct > 0) {
                doc
                    .roundedRect(x + 16, y + h - 12, Math.max(bw * c.bar.pct, 4), 3.5, 1.75)
                    .fillColor(c.bar.color)
                    .fill();
            }
        }
    });

    return y + h;
};

/* =========================================================================
 *  TARJETAS DE RESUMEN
 * ========================================================================= */

const CARD_HEAD = 54;

const cardHeader = (doc: PDFKit.PDFDocument, x: number, y: number, title: string, tag?: string): void => {
    doc.font(F.bold).fontSize(12.5).fillColor(COLOR.ink).text(title, x + CARD_PAD, y + 16, { lineBreak: false });
    if (tag) label(doc, tag, x + CARD_PAD, y + 35, CONTENT_WIDTH - CARD_PAD * 2, COLOR.accentDark);
};

const buildNarrative = (items: PdfReportItem[], config: PdfDocumentConfig): string[] => {
    const total = items.length;
    const pending = items.filter((i) => i.status === "PENDING").length;
    const attended = items.filter((i) => i.status === "ATTENDED").length;
    const rate = Math.round((attended / total) * 100);

    const byCategory = new Map<string, number>();
    items.forEach((i) => {
        const key = i.categoryName ?? "General";
        byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    });
    const top = Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const out: string[] = [];
    const totalNoun = total === 1 ? config.singularNoun : config.pluralNoun;

    if (pending === 0) {
        out.push(
            `Durante el periodo se registraron **${total} ${totalNoun}** y todas fueron atendidas, con una tasa de resolución del **${rate} %**.`,
        );
    } else {
        out.push(
            `Durante el periodo se registraron **${total} ${totalNoun}**. ` +
                `**${attended} ${attended === 1 ? "registro fue atendido" : "registros fueron atendidos"}** ` +
                `y **${pending} ${pending === 1 ? "permanece pendiente" : "permanecen pendientes"}**, ` +
                `lo que representa una tasa de resolución del **${rate} %**.`,
        );
    }

    if (top.length === 1) {
        out.push(`La categoría con mayor volumen es **${top[0][0]}** (${top[0][1]}).`);
    } else if (top.length > 1) {
        const parts = top.map(([name, count]) => `**${name}** (${count})`);
        out.push(`Las categorías con mayor volumen son ${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}.`);
    }

    return out;
};

const renderSummaryCard = (
    doc: PDFKit.PDFDocument,
    y: number,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): number => {
    const x = PAGE_MARGIN;
    const innerW = CONTENT_WIDTH - CARD_PAD * 2;

    if (items.length === 0) {
        const h = CARD_HEAD + 40;
        y = ensure(doc, y, h);
        card(doc, x, y, CONTENT_WIDTH, h);
        cardHeader(doc, x, y, "Resumen ejecutivo", "Lectura del periodo");
        doc
            .font(F.regular)
            .fontSize(9.5)
            .fillColor(COLOR.muted)
            .text(`No se encontraron ${config.pluralNoun} para los filtros seleccionados.`, x + CARD_PAD, y + CARD_HEAD, {
                width: innerW,
            });
        return y + h;
    }

    const paragraphs = buildNarrative(items, config);

    const heights = paragraphs.map((p) => richHeight(doc, p, innerW, 9.5, 3));
    const body = heights.reduce((a, b) => a + b, 0) + (paragraphs.length - 1) * 8;
    const h = CARD_HEAD + body + CARD_PAD;

    y = ensure(doc, y, h);
    card(doc, x, y, CONTENT_WIDTH, h);
    cardHeader(doc, x, y, "Resumen ejecutivo", "Lectura del periodo");

    let cy = y + CARD_HEAD;
    paragraphs.forEach((p, i) => {
        cy = richText(doc, p, x + CARD_PAD, cy, innerW, 9.5, 3);
        if (i < paragraphs.length - 1) cy += 8;
    });

    return y + h;
};

/** Filas de alerta tintadas, igual que "Ahora mismo" del dashboard. */
const renderAlertsCard = (
    doc: PDFKit.PDFDocument,
    y: number,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): number => {
    const x = PAGE_MARGIN;
    const innerW = CONTENT_WIDTH - CARD_PAD * 2;

    const pending = items
        .filter((i) => i.status === "PENDING")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const shown = pending.slice(0, 5);
    const extra = pending.length - shown.length;

    const rowH = 46;
    const rowGap = 8;
    const h = CARD_HEAD + shown.length * (rowH + rowGap) + (extra > 0 ? 18 : 0) + CARD_PAD - rowGap;

    y = ensure(doc, y, h);
    card(doc, x, y, CONTENT_WIDTH, h);
    cardHeader(
        doc,
        x,
        y,
        "Pendientes de atender",
        `${pending.length} ${pending.length === 1 ? "alerta abierta" : "alertas abiertas"}`,
    );

    let cy = y + CARD_HEAD;
    const entity = capitalize(config.singularDetailEntity);

    shown.forEach((item) => {
        const ageDays = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86_400_000);
        const critical = ageDays >= 7;
        const fg = critical ? COLOR.redFg : COLOR.amberFg;
        const bg = critical ? COLOR.redBg : COLOR.amberBg;
        const border = critical ? COLOR.redBorder : COLOR.amberBorder;
        const rx = x + CARD_PAD;

        doc.roundedRect(rx, cy, innerW, rowH, 10).lineWidth(0.75).fillAndStroke(bg, border);

        doc.circle(rx + 22, cy + rowH / 2, 12).fillColor(COLOR.paper).fill();
        drawIcon(doc, "warning", rx + 22, cy + rowH / 2, 5.4, fg);

        const title = fitText(doc, `${entity} sin atender: ${item.title}`, innerW - 56, 9, F.bold);
        doc.font(F.bold).fontSize(9).fillColor(COLOR.ink).text(title, rx + 44, cy + 11, { lineBreak: false });

        const who = (item.guardName || item.guardUsername || "").trim();
        const sub = [formatAgo(item.createdAt), formatDateTime(item.createdAt), who].filter(Boolean).join("  ·  ");
        doc
            .font(F.regular)
            .fontSize(7.8)
            .fillColor(COLOR.muted)
            .text(fitText(doc, sub, innerW - 56, 7.8, F.regular), rx + 44, cy + 26, { lineBreak: false });

        cy += rowH + rowGap;
    });

    if (extra > 0) {
        doc
            .font(F.regular)
            .fontSize(8)
            .fillColor(COLOR.muted)
            .text(`y ${extra} ${extra === 1 ? "pendiente más" : "pendientes más"} en el detalle del reporte`, x + CARD_PAD, cy + 1, {
                lineBreak: false,
            });
    }

    return y + h;
};

const renderCategoryCard = (doc: PDFKit.PDFDocument, y: number, items: PdfReportItem[]): number => {
    const x = PAGE_MARGIN;
    const innerW = CONTENT_WIDTH - CARD_PAD * 2;

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

    const rowH = 38;
    const h = CARD_HEAD + rows.length * rowH + CARD_PAD - 6;

    y = ensure(doc, y, h);
    card(doc, x, y, CONTENT_WIDTH, h);
    cardHeader(doc, x, y, "Distribución por categoría", "Volumen del periodo");

    const total = items.length;
    const nameW = innerW * 0.34;
    const pillsW = 128;
    const barX = x + CARD_PAD + nameW + 8;
    const barW = innerW - nameW - pillsW - 8 - 40;

    rows.forEach(([name, c], i) => {
        const ry = y + CARD_HEAD + i * rowH;

        doc
            .font(F.bold)
            .fontSize(9)
            .fillColor(COLOR.ink)
            .text(fitText(doc, name, nameW - 6, 9, F.bold), x + CARD_PAD, ry + 3, { lineBreak: false });
        doc
            .font(F.regular)
            .fontSize(7.8)
            .fillColor(COLOR.muted)
            .text(`${c.total} ${c.total === 1 ? "registro" : "registros"}`, x + CARD_PAD, ry + 17, { lineBreak: false });

        // Barra de participación
        const pct = Math.round((c.total / total) * 100);
        doc.roundedRect(barX, ry + 10, barW, 5, 2.5).fillColor(COLOR.line).fill();
        doc.roundedRect(barX, ry + 10, Math.max((c.total / total) * barW, 5), 5, 2.5).fillColor(COLOR.accent).fill();
        doc
            .font(F.bold)
            .fontSize(8)
            .fillColor(COLOR.text)
            .text(`${pct} %`, barX + barW + 8, ry + 8, { lineBreak: false });

        // Pastillas a la derecha
        const rightEdge = x + CARD_PAD + innerW;
        const aText = `${c.attended} atend.`;
        const pText = `${c.pending} pend.`;
        const aW = pillWidth(doc, aText, { size: 6.8 });
        pill(doc, rightEdge - aW, ry + 6, aText, c.attended > 0 ? COLOR.attended : COLOR.faint, c.attended > 0 ? COLOR.attendedBg : COLOR.wash, { size: 6.8 });
        const pW = pillWidth(doc, pText, { size: 6.8 });
        pill(doc, rightEdge - aW - 6 - pW, ry + 6, pText, c.pending > 0 ? COLOR.pending : COLOR.faint, c.pending > 0 ? COLOR.pendingBg : COLOR.wash, { size: 6.8 });
    });

    return y + h;
};

/* =========================================================================
 *  RESUMEN GENERAL (TABLA EN TARJETA)
 * ========================================================================= */

const renderSummaryTable = (
    doc: PDFKit.PDFDocument,
    startY: number,
    items: PdfReportItem[],
    config: PdfDocumentConfig,
): number => {
    if (items.length === 0) return startY;

    const x = PAGE_MARGIN;
    const innerW = CONTENT_WIDTH - CARD_PAD * 2;
    const rowH = 30;
    const colHeadH = 24;
    const headH = CARD_HEAD + colHeadH;
    const padB = 12;

    const colIdx = 28;
    const colDate = 62;
    const colTime = 40;
    const colUser = 122;
    const colStatus = 84;
    const colType = innerW - colIdx - colDate - colTime - colUser - colStatus;

    const xIdx = x + CARD_PAD;
    const xDate = xIdx + colIdx;
    const xTime = xDate + colDate;
    const xUser = xTime + colTime;
    const xType = xUser + colUser;
    const xStatus = xType + colType;

    let y = ensure(doc, startY + CARD_GAP, headH + rowH * Math.min(items.length, 3) + padB);
    let i = 0;

    while (i < items.length) {
        const avail = CONTENT_BOTTOM - y - headH - padB;
        let n = Math.floor(avail / rowH);
        if (n < 1) {
            y = newPage(doc);
            continue;
        }
        n = Math.min(n, items.length - i);

        const h = headH + n * rowH + padB;
        card(doc, x, y, CONTENT_WIDTH, h);
        cardHeader(doc, x, y, "Resumen general de registros", `${items.length} ${items.length === 1 ? "registro" : "registros"} en el periodo`);

        // Encabezado de columnas
        const hy = y + CARD_HEAD - 2;
        doc.roundedRect(x + 10, hy, CONTENT_WIDTH - 20, colHeadH - 2, 7).fillColor(COLOR.wash).fill();
        const ly = hy + 8;
        label(doc, "N.º", xIdx, ly, colIdx);
        label(doc, "Fecha", xDate, ly, colDate);
        label(doc, "Hora", xTime, ly, colTime);
        label(doc, "Usuario", xUser, ly, colUser);
        label(doc, "Tipo / categoría", xType, ly, colType);
        label(doc, "Estado", xStatus, ly, colStatus);

        for (let r = 0; r < n; r++) {
            const item = items[i + r];
            const ry = y + headH + r * rowH;
            const { date, time } = formatDateParts(item.createdAt);
            const userName = (item.guardName || item.guardUsername || "—").trim();
            const typeName = (item.typeName ?? item.categoryName ?? "General").trim();
            const attended = item.status === "ATTENDED";
            const ty = ry + 10;

            if (r > 0) hr(doc, x + CARD_PAD, ry, innerW, COLOR.line, 0.5);

            doc.font(F.regular).fontSize(8.5).fillColor(COLOR.muted).text(String(i + r + 1).padStart(2, "0"), xIdx, ty, { lineBreak: false });
            doc.fillColor(COLOR.text).text(date, xDate, ty, { lineBreak: false });
            doc.text(time, xTime, ty, { lineBreak: false });
            doc
                .font(F.bold)
                .fillColor(COLOR.ink)
                .text(fitText(doc, userName, colUser - 10, 8.5, F.bold), xUser, ty, { lineBreak: false });
            doc
                .font(F.regular)
                .fillColor(COLOR.text)
                .text(fitText(doc, typeName, colType - 10, 8.5, F.regular), xType, ty, { lineBreak: false });

            const statusText = (attended ? config.attendedLabel : config.pendingLabel).toUpperCase();
            pill(doc, xStatus, ry + 6, statusText, attended ? COLOR.attended : COLOR.pending, attended ? COLOR.attendedBg : COLOR.pendingBg, {
                size: 6.5,
                minW: 68,
            });
        }

        i += n;
        y += h;
        if (i < items.length) y = newPage(doc);
    }

    return y;
};

/* =========================================================================
 *  DETALLE DE REGISTROS
 * ========================================================================= */

const renderDetailSection = async (
    doc: PDFKit.PDFDocument,
    startY: number,
    items: PdfReportItem[],
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): Promise<void> => {
    let y = ensure(doc, startY + 24, 200);

    doc.font(F.bold).fontSize(15).fillColor(COLOR.ink).text(config.detailSectionTitle, PAGE_MARGIN, y, { lineBreak: false });
    doc
        .font(F.regular)
        .fontSize(8.5)
        .fillColor(COLOR.muted)
        .text(
            items.length === 0
                ? `Sin ${config.pluralNoun} en el periodo`
                : `${items.length} ${items.length === 1 ? "registro" : "registros"} con ubicación y evidencia`,
            PAGE_MARGIN,
            y + 21,
            { lineBreak: false },
        );
    y += 44;

    if (items.length === 0) return;

    for (let index = 0; index < items.length; index++) {
        y = await renderItem(doc, y, items[index], index + 1, options, config);
        y += 10;
    }
};

const renderItem = async (
    doc: PDFKit.PDFDocument,
    startY: number,
    item: PdfReportItem,
    index: number,
    options: PdfRenderOptions,
    config: PdfDocumentConfig,
): Promise<number> => {
    let y = renderItemHeaderCard(doc, startY, item, index, config);

    if (options.includeLocation && item.latitude !== null && item.longitude !== null) {
        y = await renderLocationCard(doc, y + 10, item.latitude, item.longitude);
    }

    if (options.includeImages && item.media.length > 0) {
        y = await renderEvidenceCard(doc, y + 10, item.media);
    }

    return y + 16;
};

const renderItemHeaderCard = (
    doc: PDFKit.PDFDocument,
    startY: number,
    item: PdfReportItem,
    index: number,
    config: PdfDocumentConfig,
): number => {
    const x = PAGE_MARGIN;
    const innerW = CONTENT_WIDTH - CARD_PAD * 2;
    const attended = item.status === "ATTENDED";
    const statusText = (attended ? config.attendedLabel : config.pendingLabel).toUpperCase();

    // Medidas
    doc.font(F.bold).fontSize(16);
    const titleW = innerW - 100;
    const titleH = doc.heightOfString(item.title, { width: titleW });

    const chips = [item.categoryName, item.typeName].filter((v): v is string => !!v && v !== item.title);

    let descH = 0;
    if (item.description) {
        doc.font(F.regular).fontSize(9.5);
        descH = doc.heightOfString(item.description.trim(), { width: innerW, lineGap: 3 });
    }

    const tilesH = 44;
    let h = 30 + titleH;
    if (chips.length > 0) h += 8 + 18;
    h += 14 + tilesH;
    if (item.description) h += 16 + 9 + 6 + descH;
    h += CARD_PAD;

    const y = ensure(doc, startY, h);
    card(doc, x, y, CONTENT_WIDTH, h);

    // Sobretítulo + estado
    label(doc, `${config.singularDetailEntity} ${String(index).padStart(2, "0")}`, x + CARD_PAD, y + 17, 200, COLOR.accent);
    const sw = pillWidth(doc, statusText, { size: 6.8, minW: 70 });
    pill(doc, x + CONTENT_WIDTH - CARD_PAD - sw, y + 13, statusText, attended ? COLOR.attended : COLOR.pending, attended ? COLOR.attendedBg : COLOR.pendingBg, {
        size: 6.8,
        minW: 70,
    });

    // Título
    let cy = y + 32;
    doc.font(F.bold).fontSize(16).fillColor(COLOR.ink).text(item.title, x + CARD_PAD, cy, { width: titleW });
    cy += titleH;

    // Chips de categoría / tipo
    if (chips.length > 0) {
        cy += 8;
        let cx = x + CARD_PAD;
        chips.forEach((c) => {
            const t = fitText(doc, c, 220, 7.5, F.bold, 0);
            const w = pillWidth(doc, t, { size: 7.5, spacing: 0 });
            pill(doc, cx, cy, t, COLOR.text, COLOR.wash, { size: 7.5, spacing: 0, h: 18, border: COLOR.line });
            cx += w + 6;
        });
        cy += 18;
    }

    // Tiles de metadatos
    cy += 14;
    renderMetaTiles(doc, item, x + CARD_PAD, cy, innerW, tilesH);
    cy += tilesH;

    // Descripción
    if (item.description) {
        cy += 16;
        label(doc, "Descripción", x + CARD_PAD, cy, innerW);
        cy += 15;
        doc.font(F.regular).fontSize(9.5).fillColor(COLOR.text).text(item.description.trim(), x + CARD_PAD, cy, {
            width: innerW,
            lineGap: 3,
        });
    }

    return y + h;
};

const renderMetaTiles = (
    doc: PDFKit.PDFDocument,
    item: PdfReportItem,
    x: number,
    y: number,
    width: number,
    height: number,
): void => {
    const created = formatDateParts(item.createdAt);

    const fields: Array<{ label: string; value: string; sub?: string; weight: number }> = [
        { label: "Fecha y hora", value: created.date, sub: `${created.time} h`, weight: 0.24 },
        { label: "Reportado por", value: item.guardName || item.guardUsername || "—", weight: 0.3 },
        { label: "ID", value: `#${item.id}`, weight: 0.12 },
    ];

    if (item.status === "ATTENDED" && item.resolvedByName) {
        fields.push({
            label: "Atendido por",
            value: item.resolvedByName,
            sub: item.resolvedAt ? formatDateTime(item.resolvedAt) : undefined,
            weight: 0.34,
        });
    } else {
        fields[0].weight = 0.3;
        fields[1].weight = 0.45;
        fields[2].weight = 0.25;
    }

    const gap = 8;
    const usable = width - gap * (fields.length - 1);
    let cx = x;

    fields.forEach((f) => {
        const w = usable * f.weight;
        doc.roundedRect(cx, y, w, height, 9).lineWidth(0.75).fillAndStroke(COLOR.wash, COLOR.line);
        label(doc, f.label, cx + 11, y + 10, w - 20);
        doc
            .font(F.bold)
            .fontSize(9.2)
            .fillColor(COLOR.ink)
            .text(fitText(doc, f.value, w - 22, 9.2, F.bold), cx + 11, y + 22, { lineBreak: false });
        if (f.sub) {
            doc.font(F.regular).fontSize(7.8).fillColor(COLOR.muted).text(f.sub, cx + 11, y + 33, { lineBreak: false });
        }
        cx += w + gap;
    });
};

/* =========================================================================
 *  UBICACIÓN
 * ========================================================================= */

const renderLocationCard = async (doc: PDFKit.PDFDocument, startY: number, lat: number, lng: number): Promise<number> => {
    const x = PAGE_MARGIN;
    const pad = 14;
    const mapW = 290;
    const mapH = 96;
    const h = mapH + pad * 2;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    // Se pide el mapa en mayor resolución y se reduce al dibujarlo: el logo y la
    // atribución de Google quedan proporcionalmente más pequeños.
    const staticUrl = buildStaticMapUrl(lat, lng, 640, Math.round((640 * mapH) / mapW));
    const mapBuf = staticUrl ? await fetchImageBuffer(staticUrl) : null;

    const y = ensure(doc, startY, h);
    card(doc, x, y, CONTENT_WIDTH, h);

    const top = y + pad;
    let infoX = x + pad;

    if (mapBuf) {
        let drawn = false;
        try {
            doc.save();
            doc.roundedRect(x + pad, top, mapW, mapH, 9).clip();
            doc.image(mapBuf, x + pad, top, { cover: [mapW, mapH], align: "center", valign: "center" });
            doc.restore();
            doc.roundedRect(x + pad, top, mapW, mapH, 9).lineWidth(0.75).strokeColor(COLOR.line).stroke();
            drawn = true;
        } catch {
            doc.restore();
        }
        if (drawn) infoX = x + pad + mapW + 16;
    }

    const infoW = x + CONTENT_WIDTH - pad - infoX;

    label(doc, "Ubicación registrada", infoX, top + 2, infoW, COLOR.accentDark);

    // Una sola tarjeta con las coordenadas
    const tileY = top + 18;
    const tileH = 34;
    doc.roundedRect(infoX, tileY, infoW, tileH, 8).lineWidth(0.75).fillAndStroke(COLOR.wash, COLOR.line);
    label(doc, "Coordenadas", infoX + 11, tileY + 8, infoW - 20);
    doc
        .font(F.mono)
        .fontSize(8.5)
        .fillColor(COLOR.ink)
        .text(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, infoX + 11, tileY + 20, { lineBreak: false });

    drawButton(doc, "Abrir en Google Maps", mapsUrl, infoX, tileY + tileH + 10, { icon: "pin" });

    return y + h;
};

/* =========================================================================
 *  EVIDENCIA
 * ========================================================================= */

type EvidenceUnit =
    | { kind: "photos"; from: number; to: number; h: number }
    | { kind: "video"; item: PdfMediaItem; n: number; of: number; h: number };

const renderEvidenceCard = async (doc: PDFKit.PDFDocument, startY: number, media: PdfMediaItem[]): Promise<number> => {
    const x = PAGE_MARGIN;
    const innerW = CONTENT_WIDTH - CARD_PAD * 2;
    const images = media.filter((m) => m.type !== "VIDEO");
    const videos = media.filter((m) => m.type === "VIDEO");

    const buffers = await Promise.all(images.map((m) => fetchImageBuffer(m.url)));
    const cellW = (innerW - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS;

    const units: EvidenceUnit[] = [];
    for (let s = 0; s < images.length; s += PHOTO_COLUMNS) {
        units.push({ kind: "photos", from: s, to: Math.min(s + PHOTO_COLUMNS, images.length), h: PHOTO_HEIGHT + 26 });
    }
    videos.forEach((v, i) => units.push({ kind: "video", item: v, n: i + 1, of: videos.length, h: 50 }));

    const HEAD = 42;
    const PAD_B = 8;
    const total = HEAD + units.reduce((a, u) => a + u.h, 0) + PAD_B;
    const pageSpan = CONTENT_BOTTOM - HEADER_OFFSET;

    let y = startY;
    // Si todo cabe en una página, se mantiene junto (evita fotos huérfanas).
    if (total <= pageSpan && y + total > CONTENT_BOTTOM) y = newPage(doc);

    let idx = 0;
    let first = true;

    while (idx < units.length) {
        const avail = CONTENT_BOTTOM - y - HEAD - PAD_B;
        const chunk: EvidenceUnit[] = [];
        let used = 0;
        while (idx + chunk.length < units.length && used + units[idx + chunk.length].h <= avail) {
            used += units[idx + chunk.length].h;
            chunk.push(units[idx + chunk.length]);
        }
        if (chunk.length === 0) {
            y = newPage(doc);
            continue;
        }

        const h = HEAD + used + PAD_B;
        card(doc, x, y, CONTENT_WIDTH, h);

        label(doc, first ? "Evidencia adjunta" : "Evidencia adjunta · continuación", x + CARD_PAD, y + 17, 260, COLOR.accentDark);
        const countText = `${media.length} ${media.length === 1 ? "archivo" : "archivos"}`;
        const cw = pillWidth(doc, countText, { size: 6.8, spacing: 0.2 });
        pill(doc, x + CONTENT_WIDTH - CARD_PAD - cw, y + 12, countText, COLOR.muted, COLOR.wash, {
            size: 6.8,
            spacing: 0.2,
            border: COLOR.line,
        });

        let cy = y + HEAD;
        chunk.forEach((u) => {
            if (u.kind === "photos") {
                for (let i = u.from; i < u.to; i++) {
                    const cx = x + CARD_PAD + (i - u.from) * (cellW + PHOTO_GAP);
                    drawPhoto(doc, buffers[i], cx, cy, cellW, PHOTO_HEIGHT);
                    linkText(doc, `Foto ${i + 1}  ·  ver original`, cx + 2, cy + PHOTO_HEIGHT + 7, images[i].url, F.regular, 7, COLOR.accent);
                }
            } else {
                drawVideoRow(doc, u, x + CARD_PAD, cy, innerW);
            }
            cy += u.h;
        });

        idx += chunk.length;
        y += h;
        first = false;
        if (idx < units.length) y = newPage(doc);
    }

    return y;
};

const drawPhoto = (doc: PDFKit.PDFDocument, buf: Buffer | null, x: number, y: number, w: number, h: number): void => {
    const r = 9;
    doc.roundedRect(x, y, w, h, r).fillColor(COLOR.wash).fill();

    let ok = false;
    if (buf) {
        try {
            doc.save();
            doc.roundedRect(x, y, w, h, r).clip();
            if (IMAGE_FIT === "cover") {
                doc.image(buf, x, y, { cover: [w, h], align: "center", valign: "center" });
            } else {
                doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" });
            }
            doc.restore();
            ok = true;
        } catch {
            doc.restore();
        }
    }

    if (!ok) {
        doc
            .font(F.regular)
            .fontSize(7.5)
            .fillColor(COLOR.muted)
            .text("Imagen no disponible", x, y + h / 2 - 4, { width: w, align: "center", lineBreak: false });
    }

    doc.roundedRect(x, y, w, h, r).lineWidth(0.75).strokeColor(COLOR.line).stroke();
};

const drawVideoRow = (
    doc: PDFKit.PDFDocument,
    u: Extract<EvidenceUnit, { kind: "video" }>,
    x: number,
    y: number,
    width: number,
): void => {
    const h = 42;
    doc.roundedRect(x, y, width, h, 10).lineWidth(0.75).fillAndStroke(COLOR.wash, COLOR.line);

    const cy = y + h / 2;
    doc.circle(x + 24, cy, 13).fillColor(COLOR.accent).fill();
    drawPlay(doc, x + 24, cy, 4.6, COLOR.paper);

    doc
        .font(F.bold)
        .fontSize(9)
        .fillColor(COLOR.ink)
        .text(u.of > 1 ? `Video ${u.n}` : "Video adjunto", x + 48, y + 10, { lineBreak: false });
    doc
        .font(F.regular)
        .fontSize(7.8)
        .fillColor(COLOR.muted)
        .text("Se abre en el navegador", x + 48, y + 24, { lineBreak: false });

    drawButton(doc, "Reproducir", u.item.url, x + width - 12, y + (h - 22) / 2, { right: true, icon: "play" });
};

/* =========================================================================
 *  ENCABEZADO Y PIE DE PÁGINA
 * ========================================================================= */

const applyChrome = (doc: PDFKit.PDFDocument, refCode: string): void => {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Margen en 0 mientras se dibuja el chrome: evita páginas en blanco.
        const { top, bottom } = doc.page.margins;
        doc.page.margins.top = 0;
        doc.page.margins.bottom = 0;
        doc.save();

        if (i > range.start) drawRunningHeader(doc, refCode);
        drawFooter(doc, i - range.start + 1, range.count);

        doc.restore();
        doc.page.margins.top = top;
        doc.page.margins.bottom = bottom;
    }
};

const drawRunningHeader = (doc: PDFKit.PDFDocument, refCode: string): void => {
    const y = 30;
    drawWordmark(doc, PAGE_MARGIN, y, 11);

    const text = `REF ${refCode}`;
    const w = pillWidth(doc, text, { size: 6.5, spacing: 0.6 });
    pill(doc, PAGE_WIDTH - PAGE_MARGIN - w, y - 1, text, COLOR.accent, COLOR.accentSoft, { size: 6.5, spacing: 0.6, h: 15 });

    hr(doc, PAGE_MARGIN, y + 24, CONTENT_WIDTH, COLOR.line, 0.75);
};

const drawFooter = (doc: PDFKit.PDFDocument, page: number, total: number): void => {
    const y = PAGE_HEIGHT - 38;

    hr(doc, PAGE_MARGIN, y - 10, CONTENT_WIDTH, COLOR.line, 0.75);
    doc
        .font(F.regular)
        .fontSize(7.5)
        .fillColor(COLOR.muted)
        .text("CheckApp  ·  Documento confidencial", PAGE_MARGIN, y, { width: 300, lineBreak: false });
    doc
        .font(F.bold)
        .fontSize(7.5)
        .fillColor(COLOR.muted)
        .text(`Página ${page} de ${total}`, PAGE_WIDTH - PAGE_MARGIN - 120, y, {
            width: 120,
            align: "right",
            lineBreak: false,
        });
};

/* =========================================================================
 *  PRIMITIVAS DE UI
 * ========================================================================= */

/** Tarjeta blanca con borde suave y radio grande. */
const card = (doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number): void => {
    doc.roundedRect(x, y, w, h, RADIUS).lineWidth(0.75).fillAndStroke(COLOR.paper, COLOR.line);
};

const hr = (doc: PDFKit.PDFDocument, x: number, y: number, w: number, color: string, weight: number): void => {
    doc.save().lineWidth(weight).strokeColor(color).moveTo(x, y).lineTo(x + w, y).stroke().restore();
};

/** Etiqueta en mayúsculas con tracking (estilo "RONDAS ACTIVAS"). */
const label = (
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    color: string = COLOR.muted,
): void => {
    const t = fitText(doc, text.toUpperCase(), width, 6.4, F.bold, 1);
    doc.font(F.bold).fontSize(6.4).fillColor(color).text(t, x, y, { characterSpacing: 1, lineBreak: false });
};

interface PillOptions {
    size?: number;
    h?: number;
    padX?: number;
    minW?: number;
    spacing?: number;
    border?: string;
}

const pillWidth = (doc: PDFKit.PDFDocument, text: string, o: PillOptions = {}): number => {
    const size = o.size ?? 7;
    const padX = o.padX ?? 9;
    doc.font(F.bold).fontSize(size);
    const tw = doc.widthOfString(text, { characterSpacing: o.spacing ?? 0.6 });
    return Math.max(tw + padX * 2, o.minW ?? 0);
};

/** Pastilla redondeada (estado, chips, referencia). Devuelve su ancho. */
const pill = (
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    text: string,
    fg: string,
    bg: string,
    o: PillOptions = {},
): number => {
    const size = o.size ?? 7;
    const h = o.h ?? 17;
    const spacing = o.spacing ?? 0.6;
    const w = pillWidth(doc, text, o);

    if (o.border) {
        doc.roundedRect(x, y, w, h, h / 2).lineWidth(0.75).fillAndStroke(bg, o.border);
    } else {
        doc.roundedRect(x, y, w, h, h / 2).fillColor(bg).fill();
    }

    doc
        .font(F.bold)
        .fontSize(size)
        .fillColor(fg)
        .text(text, x, y + (h - size) / 2 - 0.3, { width: w, align: "center", characterSpacing: spacing, lineBreak: false });
    return w;
};

/** Botón verde tipo pastilla con área clicable. Devuelve su ancho. */
const drawButton = (
    doc: PDFKit.PDFDocument,
    text: string,
    url: string,
    x: number,
    y: number,
    o: { right?: boolean; icon?: "pin" | "play" } = {},
): number => {
    const h = 22;
    const padX = 12;
    const size = 7.5;
    const iconW = o.icon ? 13 : 0;

    doc.font(F.bold).fontSize(size);
    const tw = doc.widthOfString(text, { characterSpacing: 0.3 });
    const w = tw + padX * 2 + iconW;
    const bx = o.right ? x - w : x;

    doc.roundedRect(bx, y, w, h, h / 2).fillColor(COLOR.accent).fill();
    if (o.icon === "pin") drawIcon(doc, "pin", bx + padX + 3, y + h / 2, 4.2, COLOR.paper);
    if (o.icon === "play") drawPlay(doc, bx + padX + 3, y + h / 2, 3.6, COLOR.paper);

    doc
        .font(F.bold)
        .fontSize(size)
        .fillColor(COLOR.paper)
        .text(text, bx + padX + iconW, y + (h - size) / 2 - 0.3, { characterSpacing: 0.3, lineBreak: false });

    doc.link(bx, y, w, h, url);
    return w;
};

/**
 * Texto con enlace (subrayado manual + área clicable). No se usa la opción
 * `link` de `doc.text` porque con `lineBreak: false` produce NaN en PDFKit.
 */
const linkText = (
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    url: string,
    font: string,
    size: number,
    color: string,
): void => {
    doc.font(font).fontSize(size);
    const w = doc.widthOfString(text);
    doc.fillColor(color).text(text, x, y, { lineBreak: false });
    hr(doc, x, y + size + 0.8, w, color, 0.5);
    doc.link(x, y, w, size * 1.2, url);
};

/** Recorta el texto con "…" para que quepa en `maxW`. */
const fitText = (
    doc: PDFKit.PDFDocument,
    text: string,
    maxW: number,
    size: number,
    font: string,
    spacing = 0,
): string => {
    doc.font(font).fontSize(size);
    if (doc.widthOfString(text, { characterSpacing: spacing }) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(`${t}…`, { characterSpacing: spacing }) > maxW) {
        t = t.slice(0, -1);
    }
    return `${t.trimEnd()}…`;
};

interface RichPiece {
    text: string;
    bold: boolean;
    dx: number;
}

/** Divide un texto con **negritas** en palabras (cada palabra puede mezclar tramos). */
const tokenizeRich = (text: string): Array<Array<{ text: string; bold: boolean }>> => {
    const tokens: Array<Array<{ text: string; bold: boolean }>> = [];
    let cur: Array<{ text: string; bold: boolean }> = [];

    text.split("**").forEach((seg, i) => {
        const bold = i % 2 === 1;
        let buf = "";
        for (const ch of seg) {
            if (/\s/.test(ch)) {
                if (buf) {
                    cur.push({ text: buf, bold });
                    buf = "";
                }
                if (cur.length) {
                    tokens.push(cur);
                    cur = [];
                }
            } else {
                buf += ch;
            }
        }
        if (buf) cur.push({ text: buf, bold });
    });

    if (cur.length) tokens.push(cur);
    return tokens;
};

/**
 * Maquetación propia de texto con negritas (la opción `continued` de PDFKit
 * rompe la línea al cambiar de fuente). Devuelve las líneas con su posición.
 */
const layoutRich = (doc: PDFKit.PDFDocument, text: string, width: number, size: number): RichPiece[][] => {
    const measure = (t: string, bold: boolean): number => {
        doc.font(bold ? F.bold : F.regular).fontSize(size);
        return doc.widthOfString(t);
    };

    const space = measure(" ", false);
    const lines: RichPiece[][] = [];
    let line: RichPiece[] = [];
    let cx = 0;

    tokenizeRich(text).forEach((tok) => {
        const tokW = tok.reduce((acc, r) => acc + measure(r.text, r.bold), 0);
        if (cx > 0 && cx + space + tokW > width) {
            lines.push(line);
            line = [];
            cx = 0;
        }
        if (cx > 0) cx += space;

        let dx = cx;
        tok.forEach((r) => {
            line.push({ text: r.text, bold: r.bold, dx });
            dx += measure(r.text, r.bold);
        });
        cx += tokW;
    });

    if (line.length) lines.push(line);
    return lines;
};

const richHeight = (doc: PDFKit.PDFDocument, text: string, width: number, size: number, lineGap: number): number => {
    const lines = layoutRich(doc, text, width, size);
    return Math.max(lines.length, 1) * (size * 1.2 + lineGap) - lineGap;
};

/** Párrafo con soporte de **negritas**. Devuelve la y final. */
const richText = (
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
    lineGap: number,
): number => {
    const lines = layoutRich(doc, text, width, size);
    const lineH = size * 1.2 + lineGap;

    lines.forEach((ln, li) => {
        ln.forEach((piece) => {
            doc
                .font(piece.bold ? F.bold : F.regular)
                .fontSize(size)
                .fillColor(piece.bold ? COLOR.ink : COLOR.text)
                .text(piece.text, x + piece.dx, y + li * lineH, { lineBreak: false });
        });
    });

    return y + Math.max(lines.length, 1) * lineH - lineGap;
};

/* ----- Iconos vectoriales (sin depender de glifos Unicode) ----- */

type IconName = "list" | "warning" | "check" | "image" | "pin";

const drawIcon = (doc: PDFKit.PDFDocument, name: IconName, cx: number, cy: number, s: number, color: string): void => {
    doc.save();
    switch (name) {
        case "warning":
            doc
                .moveTo(cx, cy - s)
                .lineTo(cx + s * 1.1, cy + s * 0.85)
                .lineTo(cx - s * 1.1, cy + s * 0.85)
                .closePath()
                .fillColor(color)
                .fill();
            doc.rect(cx - s * 0.09, cy - s * 0.35, s * 0.18, s * 0.58).fillColor(COLOR.paper).fill();
            doc.circle(cx, cy + s * 0.5, s * 0.11).fillColor(COLOR.paper).fill();
            break;
        case "check":
            doc
                .lineWidth(s * 0.34)
                .lineCap("round")
                .lineJoin("round")
                .strokeColor(color)
                .moveTo(cx - s * 0.7, cy + s * 0.05)
                .lineTo(cx - s * 0.18, cy + s * 0.55)
                .lineTo(cx + s * 0.75, cy - s * 0.5)
                .stroke();
            break;
        case "list":
            doc.lineWidth(s * 0.3).lineCap("round").strokeColor(color);
            [-0.55, 0, 0.55].forEach((k) => {
                doc.moveTo(cx - s * 0.15, cy + s * k).lineTo(cx + s * 0.8, cy + s * k).stroke();
                doc.circle(cx - s * 0.7, cy + s * k, s * 0.12).fillColor(color).fill();
            });
            break;
        case "image":
            doc
                .lineWidth(s * 0.26)
                .lineJoin("round")
                .strokeColor(color)
                .roundedRect(cx - s * 0.85, cy - s * 0.7, s * 1.7, s * 1.4, s * 0.25)
                .stroke();
            doc.circle(cx - s * 0.3, cy - s * 0.2, s * 0.17).fillColor(color).fill();
            doc
                .moveTo(cx - s * 0.75, cy + s * 0.6)
                .lineTo(cx - s * 0.1, cy)
                .lineTo(cx + s * 0.25, cy + s * 0.35)
                .lineTo(cx + s * 0.4, cy + s * 0.2)
                .lineTo(cx + s * 0.8, cy + s * 0.6)
                .stroke();
            break;
        case "pin":
            doc
                .moveTo(cx, cy + s)
                .bezierCurveTo(cx - s * 1.1, cy - s * 0.1, cx - s * 0.7, cy - s, cx, cy - s)
                .bezierCurveTo(cx + s * 0.7, cy - s, cx + s * 1.1, cy - s * 0.1, cx, cy + s)
                .fillColor(color)
                .fill();
            doc.circle(cx, cy - s * 0.2, s * 0.32).fillColor(COLOR.accent).fill();
            break;
    }
    doc.restore();
};

const drawPlay = (doc: PDFKit.PDFDocument, cx: number, cy: number, s: number, color: string): void => {
    doc
        .save()
        .moveTo(cx - s * 0.6, cy - s * 0.85)
        .lineTo(cx - s * 0.6, cy + s * 0.85)
        .lineTo(cx + s * 0.9, cy)
        .closePath()
        .fillColor(color)
        .fill()
        .restore();
};

/* =========================================================================
 *  LAYOUT
 * ========================================================================= */

const newPage = (doc: PDFKit.PDFDocument): number => {
    doc.addPage();
    doc.x = PAGE_MARGIN;
    doc.y = HEADER_OFFSET;
    return HEADER_OFFSET;
};

/** Si no cabe `needed` desde `y`, salta de página y devuelve la nueva y. */
const ensure = (doc: PDFKit.PDFDocument, y: number, needed: number): number => {
    return y + needed > CONTENT_BOTTOM ? newPage(doc) : y;
};

/* =========================================================================
 *  FORMATO, MAPA E IMÁGENES
 * ========================================================================= */

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Fechas de filtro (sin zona horaria, tal como llegan del request). */
const formatFilterDate = (dStr: string): string => {
    const d = new Date(dStr);
    return Number.isNaN(d.getTime())
        ? dStr
        : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateParts = (value: Date | string): { date: string; time: string } => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: "—", time: "—" };
    return {
        date: d.toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: REPORT_TIME_ZONE,
        }),
        time: d.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: REPORT_TIME_ZONE,
        }),
    };
};

const formatDateTime = (value: Date | string): string => {
    const { date, time } = formatDateParts(value);
    return date === "—" ? "—" : `${date} ${time}`;
};

/** "hace 3 días 17 h", como las alertas del dashboard. */
const formatAgo = (value: Date | string): string => {
    const ms = Date.now() - new Date(value).getTime();
    if (Number.isNaN(ms) || ms < 0) return "";
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    if (days >= 1) return `hace ${days} ${days === 1 ? "día" : "días"}${hours > 0 ? ` ${hours} h` : ""}`;
    if (hours >= 1) return `hace ${hours} h`;
    return "hace menos de 1 h";
};

/**
 * URL de Google Static Maps (requiere `GOOGLE_MAPS_API_KEY`). Oculta puntos
 * de interés y tránsito y desatura el mapa para que no compita con el reporte.
 */
const buildStaticMapUrl = (lat: number, lng: number, width: number, height: number): string | null => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;

    const params = new URLSearchParams({
        center: `${lat},${lng}`,
        zoom: "18",
        size: `${Math.min(Math.round(width), 640)}x${Math.min(Math.round(height), 640)}`,
        scale: "2",
        maptype: "roadmap",
        markers: `size:mid|color:0x065911|${lat},${lng}`,
        key,
    });
    params.append("style", "feature:poi|visibility:off");
    params.append("style", "feature:transit|visibility:off");
    params.append("style", "feature:all|saturation:-60");

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
        return buf.length === 0 ? null : buf;
    } catch {
        return null;
    }
};