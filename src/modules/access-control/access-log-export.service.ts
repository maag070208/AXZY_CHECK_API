import { Response } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { reportTimeZone } from "@src/client/branding";
import { ClientScope } from "@src/core/scope/client-scope";
import { ACCESS_EXPORT_HEADER, AccessExportQuery, accessEventExportRows } from "./access-control.service";

const localDateTime = (date: Date) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: reportTimeZone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(date);

const fileName = (extension: string) => `bitacora-accesos-${new Date().toISOString().slice(0, 10)}.${extension}`;

/** Historial de accesos en Excel, con los filtros de la bitácora. */
export const streamAccessEventsXlsx = async (res: Response, query: AccessExportQuery, scope: ClientScope | undefined): Promise<void> => {
  const rows = await accessEventExportRows(query, scope);

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Bitácora");
  sheet.addRow(ACCESS_EXPORT_HEADER).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRows(rows.map((row) => [localDateTime(row.occurredAt), ...row.cells]));
  sheet.columns.forEach((column) => {
    column.width = 20;
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName("xlsx")}"`);
  await book.xlsx.write(res);
  res.end();
};

/** Ancho de cada columna del PDF, en el orden de ACCESS_EXPORT_HEADER. */
const PDF_COLUMNS = [78, 92, 80, 70, 100, 36, 42, 50, 70, 74];

/** Historial de accesos en PDF horizontal, con los filtros de la bitácora. */
export const streamAccessEventsPdf = async (res: Response, query: AccessExportQuery, scope: ClientScope | undefined): Promise<void> => {
  const rows = await accessEventExportRows(query, scope);

  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName("pdf")}"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom;

  const drawRow = (cells: string[], font: string) => {
    doc.font(font).fontSize(7);
    const height = Math.max(...cells.map((cell, index) => doc.heightOfString(cell || " ", { width: PDF_COLUMNS[index] - 4 })));
    if (doc.y + height > bottom) doc.addPage();
    const top = doc.y;
    let x = left;
    cells.forEach((cell, index) => {
      doc.text(cell, x, top, { width: PDF_COLUMNS[index] - 4 });
      x += PDF_COLUMNS[index];
    });
    doc.x = left;
    doc.y = top + height + 3;
  };

  doc.font("Helvetica-Bold").fontSize(16).text("Bitácora de accesos");
  doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`${rows.length} registros`).fillColor("#0f172a").moveDown(0.5);

  drawRow(ACCESS_EXPORT_HEADER, "Helvetica-Bold");
  rows.forEach((row) => drawRow([localDateTime(row.occurredAt), ...row.cells], "Helvetica"));
  if (rows.length === 0) doc.font("Helvetica").fontSize(9).text("Sin registros con estos filtros.");

  doc.end();
};
