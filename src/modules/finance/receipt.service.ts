import { Response } from "express";
import PDFDocument from "pdfkit";
import dayjs from "dayjs";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { ensurePaymentFolio } from "./finance.service";

const money = (value: unknown) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  AJUSTE: "Ajuste",
};

const getPayment = async (paymentId: number, actorId: number, canManage: boolean) => {
  const payment = await prismaClient.payment.findUnique({
    where: { id: paymentId },
    include: {
      property: { select: { identifier: true, name: true } },
      resident: { select: { name: true, lastName: true } },
      registeredBy: { select: { name: true, lastName: true } },
      allocations: {
        include: { charge: { select: { concept: true, residentId: true, dueDate: true } } },
      },
    },
  });

  if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "Pago no encontrado", 404);
  if (!canManage) {
    const owns =
      payment.residentId === actorId ||
      payment.allocations.some((allocation) => allocation.charge.residentId === actorId);
    if (!owns) throw new AppError("PAYMENT_NOT_FOUND", "Pago no encontrado", 404);
  }
  return payment;
};

/**
 * Genera el recibo PDF en memoria y lo escribe en la respuesta. El folio se
 * asigna de forma perezosa si el pago es anterior a la fase 4.
 */
export const streamPaymentReceipt = async (
  res: Response,
  paymentId: number,
  actorId: number,
  canManage: boolean,
): Promise<void> => {
  const payment = await getPayment(paymentId, actorId, canManage);
  const folio = payment.folio ?? (await ensurePaymentFolio(payment.id));

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recibo-${String(folio).padStart(6, "0")}.pdf"`);
  doc.pipe(res);

  const residentName = `${payment.resident?.name ?? ""} ${payment.resident?.lastName ?? ""}`.trim();
  const registeredBy = `${payment.registeredBy?.name ?? ""} ${payment.registeredBy?.lastName ?? ""}`.trim();
  const paidAt = dayjs(payment.paidAt).format("DD/MM/YYYY");

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#065911").text("CheckApp Residencial");
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(12).fillColor("#0F172A").text("Recibo de pago");
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A").text(`Folio: ${String(folio).padStart(6, "0")}`);
  doc.font("Helvetica").fontSize(10).fillColor("#475569").text(`Fecha de pago: ${paidAt}`);
  doc.text(`Propiedad: ${payment.property?.identifier ?? "—"} · ${payment.property?.name ?? ""}`.trim());
  doc.text(`Residente: ${residentName || "—"}`);
  if (registeredBy) doc.text(`Registrado por: ${registeredBy}`);
  doc.moveDown(0.8);

  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor("#E6EEE9").stroke();
  doc.moveDown(0.6);

  const drawRow = (label: string, value: string, opts: { bold?: boolean; muted?: boolean } = {}) => {
    const y = doc.y;
    doc
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor(opts.muted ? "#64748B" : "#0F172A")
      .text(label, 48, y, { width: 360 });
    doc
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor(opts.muted ? "#64748B" : "#0F172A")
      .text(value, 430, y, { width: 117, align: "right" });
    doc.y = y + 16;
  };

  drawRow("CONCEPTO", "MONTO", { bold: true, muted: true });

  if (payment.allocations.length === 0) {
    drawRow("Saldo a favor", money(payment.amount));
  } else {
    for (const allocation of payment.allocations) {
      drawRow(allocation.charge?.concept ?? "Cargo", money(allocation.amount));
    }
  }

  doc.moveDown(0.4);
  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor("#E6EEE9").stroke();
  doc.moveDown(0.6);

  const row = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).fillColor("#0F172A").text(label, 48, y, { width: 360 });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).fillColor("#0F172A").text(value, 430, y, { width: 117, align: "right" });
    doc.y = y + 17;
  };

  row("Método", METHOD_LABEL[payment.method] ?? payment.method);
  if (payment.reference) row("Referencia", payment.reference);
  row("Total recibido", money(payment.amount), true);
  if (Number(payment.unallocatedAmount) > 0) {
    row("Saldo a favor", money(payment.unallocatedAmount));
  }
  if (payment.voidedAt) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#B91C1C").text("PAGO REVERSADO");
  }

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(9).fillColor("#94A3B8").text("Este recibo se generó automáticamente. Conserva el folio para cualquier aclaración.");
  doc.end();
};

export { money as formatReceiptMoney };
