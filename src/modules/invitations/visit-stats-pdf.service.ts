import { Response } from "express";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import { getVisitStats } from "./invitations.service";

const formatMinutes = (minutes: number | null) => {
  if (minutes === null) return "Sin datos";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/** Reporte de indicadores de visitas en PDF. Se genera en memoria y se escribe en la respuesta. */
export const streamVisitStatsPdf = async (
  res: Response,
  params: { from: Date; to: Date; propertyId?: number },
): Promise<void> => {
  const stats = await getVisitStats(params);
  const period = `${dayjs(params.from).format("DD/MM/YYYY")} a ${dayjs(params.to).format("DD/MM/YYYY")}`;

  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="indicadores-visitas-${dayjs(params.to).format("YYYY-MM-DD")}.pdf"`);
  doc.pipe(res);

  const heading = (text: string) => doc.moveDown(1).font("Helvetica-Bold").fontSize(12).text(text).moveDown(0.3).font("Helvetica").fontSize(10);

  doc.font("Helvetica-Bold").fontSize(18).text("Indicadores de visitas");
  doc.font("Helvetica").fontSize(10).fillColor("#475569").text(`Periodo: ${period}`).fillColor("#0f172a");

  heading("Resumen");
  doc.text(`Entradas: ${stats.entries}`);
  doc.text(`Entregas de repartidores: ${stats.deliveries}`);
  doc.text(`Permanencia promedio: ${formatMinutes(stats.averageStayMinutes)}`);
  doc.text(`Intentos rechazados: ${stats.rejected.total}`);
  doc.text(`Excedieron su tiempo: ${stats.exceededStay} (límite ${stats.maxStayHours} h)`);
  doc.text(`Sin salida registrada: ${stats.noExit}`);
  doc.text(`Visitas fuera de tiempo ahora: ${stats.overstayedNow}`);

  heading("Horas pico");
  const peaks = stats.byHour.filter((h) => h.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  if (peaks.length === 0) doc.text("Sin entradas en el periodo.");
  peaks.forEach((h) => doc.text(`${String(h.hour).padStart(2, "0")}:00  ·  ${h.count} entradas`));

  const periods = (title: string, rows: typeof stats.byDay) => {
    heading(title);
    if (rows.length === 0) doc.text("Sin entradas en el periodo.");
    rows.forEach((row) => doc.text(`${row.period}  ·  ${row.count} visitas  ·  ${row.deliveries} entregas`));
  };
  periods("Visitas por mes", stats.byMonth);
  periods("Visitas por semana (inicia lunes)", stats.byWeek);
  periods("Visitas por día", stats.byDay);

  heading("Casas con más visitas");
  if (stats.byProperty.length === 0) doc.text("Sin visitas en el periodo.");
  stats.byProperty.slice(0, 15).forEach((p) => {
    doc.text(`${p.identifier}  ·  ${p.entries} visitas  ·  ${formatMinutes(p.averageStayMinutes)} en promedio`);
  });

  heading("Motivos de rechazo");
  if (stats.rejected.byReason.length === 0) doc.text("Ningún intento rechazado.");
  stats.rejected.byReason.forEach((r) => doc.text(`${r.label}  ·  ${r.count}`));

  doc.end();
};
