import { AccessDecision, AccessDirection, AccessMethod, AccessSource, ChargeStatus, Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const asNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const today = () => {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  return value;
};
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

const serializeRule = (rule: {
  id: number;
  enabled: boolean;
  minOverdueDays: number;
  blockVisitors: boolean;
  active: boolean;
  updatedById: number | null;
  updatedAt: Date;
  updatedBy?: { id: number; name: string; lastName: string | null } | null;
}) => ({
  ...rule,
  updatedBy: rule.updatedBy ?? null,
  updatedAt: rule.updatedAt.toISOString(),
});

/** Regla singleton (id=1). Se crea con los valores seguros por defecto si no existe. */
export const getDelinquencyRule = async () => {
  const rule = await prismaClient.delinquencyRule.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, enabled: true, minOverdueDays: 30, blockVisitors: true, active: true },
    include: { updatedBy: { select: { id: true, name: true, lastName: true } } },
  });
  return serializeRule(rule);
};

export const updateDelinquencyRule = async (
  actorId: number,
  input: { enabled: boolean; minOverdueDays: number; blockVisitors: boolean; active: boolean },
) => {
  const rule = await prismaClient.delinquencyRule.upsert({
    where: { id: 1 },
    update: { ...input, updatedById: actorId },
    create: { id: 1, ...input, updatedById: actorId },
    include: { updatedBy: { select: { id: true, name: true, lastName: true } } },
  });
  return serializeRule(rule);
};

const activeException = async (propertyId: number) => {
  return prismaClient.accessException.findFirst({
    where: { propertyId, revokedAt: null, validUntil: { gt: new Date() } },
    orderBy: { validUntil: "desc" },
  });
};

const propertyDebt = async (propertyId: number, minOverdueDays: number) => {
  const cutoff = new Date(today().getTime() - minOverdueDays * DAY_MS);
  const charges = await prismaClient.charge.findMany({
    where: {
      propertyId,
      status: { in: [ChargeStatus.PENDING, ChargeStatus.PARTIAL] },
      dueDate: { lt: cutoff },
    },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      allocations: { where: { payment: { voidedAt: null } }, select: { amount: true } },
    },
  });

  let overdueAmount = 0;
  let oldestDue: Date | null = null;
  for (const charge of charges) {
    const paid = charge.allocations.reduce((sum, allocation) => sum + asNumber(allocation.amount), 0);
    const outstanding = round2(asNumber(charge.amount) - paid);
    if (outstanding <= 0) continue;
    overdueAmount = round2(overdueAmount + outstanding);
    if (!oldestDue || charge.dueDate < oldestDue) oldestDue = charge.dueDate;
  }

  const overdueDays = oldestDue
    ? Math.max(0, Math.floor((today().getTime() - oldestDue.getTime()) / DAY_MS))
    : 0;

  return { overdueAmount, overdueDays, charges: charges.length };
};

export interface PropertyAccessStatus {
  propertyId: number;
  blocked: boolean;
  reason: "RULE_DISABLED" | "CLEAR" | "PROPERTY_DEBT" | "EXCEPTION";
  debtStatus: "CLEAR" | "OVERDUE";
  overdueDays: number;
  overdueAmount: number;
  blockVisitors: boolean;
  exceptionUntil: string | null;
}

/** Estado interno para decidir accesos. No se devuelve el monto al guardia. */
export const getPropertyAccessStatus = async (propertyId: number): Promise<PropertyAccessStatus> => {
  const rule = await getDelinquencyRule();
  if (!rule.enabled || !rule.active) {
    return { propertyId, blocked: false, reason: "RULE_DISABLED", debtStatus: "CLEAR", overdueDays: 0, overdueAmount: 0, blockVisitors: rule.blockVisitors, exceptionUntil: null };
  }

  const exception = await activeException(propertyId);
  if (exception) {
    return {
      propertyId,
      blocked: false,
      reason: "EXCEPTION",
      debtStatus: "CLEAR",
      overdueDays: 0,
      overdueAmount: 0,
      blockVisitors: rule.blockVisitors,
      exceptionUntil: exception.validUntil.toISOString(),
    };
  }

  const debt = await propertyDebt(propertyId, rule.minOverdueDays);
  if (debt.overdueAmount > 0) {
    return {
      propertyId,
      blocked: true,
      reason: "PROPERTY_DEBT",
      debtStatus: "OVERDUE",
      overdueDays: debt.overdueDays,
      overdueAmount: debt.overdueAmount,
      blockVisitors: rule.blockVisitors,
      exceptionUntil: null,
    };
  }

  return { propertyId, blocked: false, reason: "CLEAR", debtStatus: "CLEAR", overdueDays: 0, overdueAmount: 0, blockVisitors: rule.blockVisitors, exceptionUntil: null };
};

/** Payload para caseta: sin montos ni datos financieros sensibles. */
export const getGuardAccessStatus = async (propertyId: number) => {
  const status = await getPropertyAccessStatus(propertyId);
  return {
    propertyId: status.propertyId,
    blocked: status.blocked,
    reason: status.reason,
    debtStatus: status.debtStatus,
    overdueDays: status.overdueDays,
    blockVisitors: status.blockVisitors,
    exceptionUntil: status.exceptionUntil,
  };
};

export const recordAccessEvent = async (input: {
  propertyId: number;
  personId?: number | null;
  invitationId?: number | null;
  vehicleId?: number | null;
  method: AccessMethod;
  direction: AccessDirection;
  decision: AccessDecision;
  reason?: string | null;
  guardId?: number | null;
  metadata?: Prisma.InputJsonValue | null;
}) => {
  return prismaClient.accessEvent.create({
    data: {
      propertyId: input.propertyId,
      personId: input.personId ?? null,
      invitationId: input.invitationId ?? null,
      vehicleId: input.vehicleId ?? null,
      method: input.method,
      direction: input.direction,
      source: AccessSource.GUARD,
      decision: input.decision,
      reason: input.reason ?? null,
      guardId: input.guardId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
};

export const listAccessEvents = async (query: {
  page: number;
  pageSize: number;
  propertyId?: number;
  method?: AccessMethod;
  decision?: AccessDecision;
  from?: string;
  to?: string;
}) => {
  const where: Prisma.AccessEventWhereInput = {
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.decision ? { decision: query.decision } : {}),
    ...((query.from || query.to) && {
      occurredAt: {
        ...(query.from ? { gte: dateOnly(query.from) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    }),
  };

  const [items, total] = await prismaClient.$transaction([
    prismaClient.accessEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        property: { select: { id: true, identifier: true, name: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, plate: true, tagCode: true } },
        guard: { select: { id: true, name: true, lastName: true } },
      },
    }),
    prismaClient.accessEvent.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
};

export const createAccessException = async (
  actorId: number,
  input: { propertyId: number; reason: string; validUntil: string },
) => {
  const property = await prismaClient.property.findFirst({ where: { id: input.propertyId, softDelete: false }, select: { id: true } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
  const validUntil = dateOnly(input.validUntil);
  if (validUntil.getTime() <= today().getTime()) {
    throw new AppError("INVALID_EXCEPTION_DATE", "La excepción debe vencer en una fecha futura", 400);
  }
  return prismaClient.accessException.create({
    data: { propertyId: input.propertyId, reason: input.reason.trim(), validUntil, createdById: actorId },
    include: { property: { select: { id: true, identifier: true, name: true } }, createdBy: { select: { id: true, name: true, lastName: true } } },
  });
};

export const listAccessExceptions = async (propertyId?: number) => {
  return prismaClient.accessException.findMany({
    where: { ...(propertyId ? { propertyId } : {}), revokedAt: null },
    orderBy: { validUntil: "desc" },
    include: { property: { select: { id: true, identifier: true, name: true } }, createdBy: { select: { id: true, name: true, lastName: true } } },
  });
};

export const revokeAccessException = async (id: number) => {
  const exception = await prismaClient.accessException.findUnique({ where: { id } });
  if (!exception) throw new AppError("ACCESS_EXCEPTION_NOT_FOUND", "Excepción no encontrada", 404);
  return prismaClient.accessException.update({ where: { id }, data: { revokedAt: new Date() } });
};
