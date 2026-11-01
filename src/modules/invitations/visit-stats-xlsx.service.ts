import { Response } from "express";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import { getVisitStats } from "./invitations.service";

const addSheet = (book: ExcelJS.Workbook, name: string, header: string[], rows: (string | number | null)[][]) => {
  const sheet = book.addWorksheet(name);
  sheet.addRow(header).font = { bold: true };
  sheet.addRows(rows);
  sheet.columns.forEach((column, index) => {
    const longest = Math.max(header[index].length, ...rows.map((row) => String(row[index] ?? "").length));
    column.width = longest + 2;
  });
};

/** Reporte de indicadores de visitas en Excel: una hoja por indicador. */
export const streamVisitStatsXlsx = async (
  res: Response,
  params: { from: Date; to: Date; propertyId?: number },
): Promise<void> => {
  const stats = await getVisitStats(params);
  const periodRows = (rows: typeof stats.byDay) => rows.map((row) => [row.period, row.count, row.deliveries]);

  const book = new ExcelJS.Workbook();
  addSheet(book, "Resumen", ["Indicador", "Valor"], [
    ["Desde", dayjs(params.from).format("DD/MM/YYYY")],
    ["Hasta", dayjs(params.to).format("DD/MM/YYYY")],
    ["Entradas", stats.entries],
    ["Entregas de repartidores", stats.deliveries],
    ["Permanencia promedio (min)", stats.averageStayMinutes],
    ["Intentos rechazados", stats.rejected.total],
    [`Excedieron su tiempo (límite ${stats.maxStayHours} h)`, stats.exceededStay],
    ["Sin salida registrada", stats.noExit],
    ["Fuera de tiempo ahora", stats.overstayedNow],
  ]);
  addSheet(book, "Por día", ["Día", "Visitas", "Entregas"], periodRows(stats.byDay));
  addSheet(book, "Por semana", ["Semana (lunes)", "Visitas", "Entregas"], periodRows(stats.byWeek));
  addSheet(book, "Por mes", ["Mes", "Visitas", "Entregas"], periodRows(stats.byMonth));
  addSheet(book, "Por hora", ["Hora", "Visitas"], stats.byHour.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.count]));
  addSheet(
    book,
    "Por casa",
    ["Casa", "Visitas", "Permanencia promedio (min)"],
    stats.byProperty.map((p) => [p.identifier, p.entries, p.averageStayMinutes]),
  );
  addSheet(book, "Rechazos", ["Motivo", "Intentos"], stats.rejected.byReason.map((r) => [r.label, r.count]));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="indicadores-visitas-${dayjs(params.to).format("YYYY-MM-DD")}.xlsx"`);
  await book.xlsx.write(res);
  res.end();
};
