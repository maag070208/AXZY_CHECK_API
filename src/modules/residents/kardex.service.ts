import { ResidentStatus } from "@prisma/client";
import { findResidentPropertyId } from "./resident-property.service";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import type { ResidentKardexQuery } from "./kardex.schemas";

export type ResidentKardexType = "ACCESS_ENTRY" | "ACCESS_EXIT" | "INCIDENT" | "CHARGE" | "PAYMENT";

export interface ResidentKardexItem {
  id: string;
  type: ResidentKardexType;
  title: string;
  subtitle?: string | null;
  occurredAt: string;
  amount?: number | null;
  status?: string | null;
  referenceId: number;
}

const asNumber = (value: unknown) => Number(value ?? 0);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const startOfDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
const endOfDay = (value: string) => new Date(`${value}T23:59:59.999Z`);
const defaultFrom = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  CUOTA: "Cuota",
  MANTENIMIENTO: "Mantenimiento",
  EXTRA: "Extra",
  RECARGO: "Recargo",
  MULTA: "Multa / Infracción",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  AJUSTE: "Ajuste",
};

const residentPropertyId = (userId: number): Promise<number | null> => findResidentPropertyId(userId);

/**
 * Kardex del residente: timeline de accesos de sus invitados, incidencias de su
 * propiedad, cargos y pagos propios. Solo lectura; el filtro por propiedad y
 * residente se hace en el servidor.
 */
export const getResidentKardex = async (userId: number, query: ResidentKardexQuery) => {
  const propertyId = await residentPropertyId(userId);
  if (!propertyId) {
    throw new AppError("NO_ACTIVE_RESIDENCE", "Tu cuenta no está ligada a una propiedad activa", 403);
  }

  const from = query.from ? startOfDay(query.from) : defaultFrom();
  // Incluye todo el día de hoy: los pagos con fecha sin hora se guardan al mediodía UTC.
  const to = query.to ? endOfDay(query.to) : endOfDay(new Date().toISOString().slice(0, 10));

  const [invitations, incidents, charges, payments] = await Promise.all([
    prismaClient.invitation.findMany({
      where: {
        propertyId,
        OR: [
          { entryTime: { gte: from, lte: to } },
          { exitTime: { gte: from, lte: to } },
        ],
      },
      select: {
        id: true,
        guestName: true,
        code: true,
        entryTime: true,
        exitTime: true,
        type: { select: { value: true } },
      },
    }),
    prismaClient.incident.findMany({
      where: { propertyId, createdAt: { gte: from, lte: to } },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prismaClient.charge.findMany({
      where: { residentId: userId, createdAt: { gte: from, lte: to } },
      select: { id: true, concept: true, category: true, amount: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prismaClient.payment.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        OR: [
          { residentId: userId },
          { allocations: { some: { charge: { residentId: userId } } } },
        ],
      },
      select: {
        id: true,
        amount: true,
        method: true,
        reference: true,
        paidAt: true,
        voidedAt: true,
        residentId: true,
        allocations: { where: { charge: { residentId: userId } }, select: { amount: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 300,
    }),
  ]);

  const items: ResidentKardexItem[] = [];

  for (const invitation of invitations) {
    const subtitle = [invitation.code, invitation.type?.value].filter(Boolean).join(" · ");
    if (invitation.entryTime && invitation.entryTime >= from && invitation.entryTime <= to) {
      items.push({
        id: `invitation-${invitation.id}-entry`,
        type: "ACCESS_ENTRY",
        title: `Entrada de ${invitation.guestName}`,
        subtitle,
        occurredAt: invitation.entryTime.toISOString(),
        referenceId: invitation.id,
      });
    }
    if (invitation.exitTime && invitation.exitTime >= from && invitation.exitTime <= to) {
      items.push({
        id: `invitation-${invitation.id}-exit`,
        type: "ACCESS_EXIT",
        title: `Salida de ${invitation.guestName}`,
        subtitle,
        occurredAt: invitation.exitTime.toISOString(),
        referenceId: invitation.id,
      });
    }
  }

  for (const incident of incidents) {
    items.push({
      id: `incident-${incident.id}`,
      type: "INCIDENT",
      title: incident.title,
      subtitle: "Incidencia de la propiedad",
      occurredAt: incident.createdAt.toISOString(),
      status: incident.status,
      referenceId: incident.id,
    });
  }

  for (const charge of charges) {
    items.push({
      id: `charge-${charge.id}`,
      type: "CHARGE",
      title: charge.concept,
      subtitle: `Cargo · ${CHARGE_CATEGORY_LABELS[charge.category] ?? charge.category}`,
      occurredAt: charge.createdAt.toISOString(),
      amount: round2(asNumber(charge.amount)),
      status: charge.status,
      referenceId: charge.id,
    });
  }

  for (const payment of payments) {
    const applied = round2(
      payment.allocations.reduce((sum, allocation) => sum + asNumber(allocation.amount), 0),
    );
    const amount =
      payment.residentId === userId
        ? round2(asNumber(payment.amount))
        : applied;
    if (amount <= 0 && payment.residentId !== userId) continue;

    items.push({
      id: `payment-${payment.id}`,
      type: "PAYMENT",
      title: payment.voidedAt ? "Pago reversado" : "Pago recibido",
      subtitle: [PAYMENT_METHOD_LABELS[payment.method] ?? payment.method, payment.reference].filter(Boolean).join(" · "),
      occurredAt: payment.paidAt.toISOString(),
      amount,
      status: payment.voidedAt ? "VOIDED" : "REGISTERED",
      referenceId: payment.id,
    });
  }

  const filtered = query.type
    ? items.filter((item) => {
        if (query.type === "ACCESS") return item.type === "ACCESS_ENTRY" || item.type === "ACCESS_EXIT";
        if (query.type === "INCIDENT") return item.type === "INCIDENT";
        return item.type === "CHARGE" || item.type === "PAYMENT";
      })
    : items;

  filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const total = filtered.length;
  const start = (query.page - 1) * query.pageSize;

  return {
    items: filtered.slice(start, start + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize,
    from: from.toISOString(),
    to: to.toISOString(),
    propertyId,
  };
};
