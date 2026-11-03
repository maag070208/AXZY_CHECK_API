import { AccessDecision, AccessDirection, AccessMethod, AccessSource, ChargeStatus, Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { ClientScope, scopeByClient, scopeByProperty } from "@src/core/scope/client-scope";

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const asNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const today = () => {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  return value;
};
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/**
 * Multicliente: propiedad del cliente del alcance. Una propiedad de otro cliente responde 404 igual que una
 * inexistente, para no revelar que existe en otro cliente (lecturas, ediciones y validaciones en caseta).
 */
export const propertyInScope = async (
  propertyId: number,
  scope: ClientScope | undefined,
  code = "PROPERTY_NOT_FOUND",
  message = "Propiedad no encontrada",
) => {
  const property = await prismaClient.property.findFirst({
    where: { id: propertyId, softDelete: false, ...scopeByClient(scope) },
    select: { id: true, identifier: true, name: true },
  });
  if (!property) throw new AppError(code, message, 404);
  return property;
};

/**
 * Multicliente: propiedad referenciada en un alta. Inexistente o borrada = 404; existente pero de otro
 * cliente = 400 (referencia ajena, no es un recurso que el alcance pueda tocar).
 */
export const propertyReferenceInScope = async (propertyId: number, scope: ClientScope | undefined) => {
  const property = await prismaClient.property.findFirst({
    where: { id: propertyId, softDelete: false },
    select: { id: true, clientId: true },
  });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
  if (property.clientId !== scopeByClient(scope).clientId) {
    throw new AppError("PROPERTY_OUT_OF_CLIENT", "La propiedad no pertenece al cliente seleccionado", 400);
  }
  return property;
};

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

/** Payload para caseta: sin montos ni datos financieros sensibles. Solo de propiedades del cliente del alcance. */
export const getGuardAccessStatus = async (propertyId: number, scope: ClientScope | undefined) => {
  await propertyInScope(propertyId, scope);
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

/** Motivos de la bitácora en español, para reportes y exportaciones. */
export const ACCESS_REASON_LABEL: Record<string, string> = {
  PROPERTY_DEBT: "Adeudo",
  EXCEPTION: "Excepción",
  PIN_VALID: "PIN válido",
  PERSONAL_QR: "Pase QR personal",
  INVALID_PIN: "PIN inválido",
  VEHICLE_ENTRY: "Entrada de vehículo",
  VEHICLE_EXIT: "Salida de vehículo",
  EXIT: "Salida",
  CLEAR: "Sin adeudo",
  IN_SCHEDULE: "En horario",
  OUT_OF_SCHEDULE: "Fuera de horario",
  REVOKED: "Revocado",
  EXPIRED: "Vencido",
  NOT_YET_VALID: "Aún no vigente",
  ALREADY_USED: "Pase ya usado",
  SCOPE_MISMATCH: "Tipo de acceso distinto",
  UNKNOWN_PASS: "Pase desconocido",
  NO_AUTHORIZATION: "Sin autorización",
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

export type AccessEventsQuery = {
  page: number;
  pageSize: number;
  propertyId?: number;
  personId?: number;
  method?: AccessMethod;
  direction?: AccessDirection;
  decision?: AccessDecision;
  q?: string;
  from?: string;
  to?: string;
};

/** `where` de la bitácora con los filtros de la consulta (el cliente se agrega aparte, nunca desde el cliente). */
const accessEventWhere = (query: Omit<AccessEventsQuery, "page" | "pageSize">): Prisma.AccessEventWhereInput => {
  const q = query.q?.trim();
  return {
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.decision ? { decision: query.decision } : {}),
    ...(q
      ? {
          OR: [
            { property: { identifier: { contains: q, mode: "insensitive" } } },
            { property: { name: { contains: q, mode: "insensitive" } } },
            { person: { firstName: { contains: q, mode: "insensitive" } } },
            { person: { lastName: { contains: q, mode: "insensitive" } } },
            { vehicle: { plate: { contains: q, mode: "insensitive" } } },
            { vehicle: { tagCode: { contains: q, mode: "insensitive" } } },
            { invitation: { guestName: { contains: q, mode: "insensitive" } } },
            { guard: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...((query.from || query.to) && {
      occurredAt: {
        ...(query.from ? { gte: dateOnly(query.from) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    }),
  };
};

const runAccessEventQuery = async (where: Prisma.AccessEventWhereInput, page: number, pageSize: number) => {
  const [items, total] = await prismaClient.$transaction([
    prismaClient.accessEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        property: { select: { id: true, identifier: true, name: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, plate: true, tagCode: true } },
        invitation: { select: { id: true, code: true, guestName: true } },
        guard: { select: { id: true, name: true, lastName: true } },
      },
    }),
    prismaClient.accessEvent.count({ where }),
  ]);

  return { items, total, page, pageSize };
};

/** Bitácora del cliente del alcance. Sin cliente responde 403, nunca "todos los eventos". */
export const listAccessEvents = async (query: AccessEventsQuery, scope: ClientScope | undefined) =>
  runAccessEventQuery({ ...accessEventWhere(query), ...scopeByProperty(scope) }, query.page, query.pageSize);

/**
 * Bitácora de una sola propiedad, para el autoservicio del residente. El alcance es la propiedad de su
 * vínculo (ya resuelta por el controlador), así que no depende del cliente del token.
 */
export const listAccessEventsOfProperty = (query: AccessEventsQuery, propertyId: number) =>
  runAccessEventQuery(accessEventWhere({ ...query, propertyId }), query.page, query.pageSize);

export const createAccessException = async (
  actorId: number,
  input: { propertyId: number; reason: string; validUntil: string },
  scope: ClientScope | undefined,
) => {
  // Alta: la propiedad de otro cliente es una referencia ajena (400); inexistente, 404.
  await propertyReferenceInScope(input.propertyId, scope);
  const validUntil = dateOnly(input.validUntil);
  if (validUntil.getTime() <= today().getTime()) {
    throw new AppError("INVALID_EXCEPTION_DATE", "La excepción debe vencer en una fecha futura", 400);
  }
  return prismaClient.accessException.create({
    data: { propertyId: input.propertyId, reason: input.reason.trim(), validUntil, createdById: actorId },
    include: { property: { select: { id: true, identifier: true, name: true } }, createdBy: { select: { id: true, name: true, lastName: true } } },
  });
};

export const listAccessExceptions = async (propertyId: number | undefined, scope: ClientScope | undefined) => {
  return prismaClient.accessException.findMany({
    where: { ...(propertyId ? { propertyId } : {}), revokedAt: null, ...scopeByProperty(scope) },
    orderBy: { validUntil: "desc" },
    include: { property: { select: { id: true, identifier: true, name: true } }, createdBy: { select: { id: true, name: true, lastName: true } } },
  });
};

export const revokeAccessException = async (id: number, scope: ClientScope | undefined) => {
  // De otro cliente responde 404, igual que una excepción inexistente.
  const exception = await prismaClient.accessException.findFirst({ where: { id, ...scopeByProperty(scope) } });
  if (!exception) throw new AppError("ACCESS_EXCEPTION_NOT_FOUND", "Excepción no encontrada", 404);
  return prismaClient.accessException.update({ where: { id }, data: { revokedAt: new Date() } });
};


const csvCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const ACCESS_EXPORT_HEADER = ["Fecha", "Propiedad", "Persona", "Vehículo", "Invitado", "Método", "Sentido", "Decisión", "Guardia", "Motivo"];

export type AccessExportQuery = Omit<AccessEventsQuery, "page" | "pageSize">;

/** Filas del historial para CSV, Excel y PDF, con tope de 5,000 registros por archivo. */
export const accessEventExportRows = async (query: AccessExportQuery, scope: ClientScope | undefined) => {
  const result = await listAccessEvents({ ...query, page: 1, pageSize: 5000 }, scope);
  return result.items.map((event: any) => ({
    occurredAt: event.occurredAt as Date,
    cells: [
      event.property ? `${event.property.identifier} · ${event.property.name}` : "",
      event.person ? `${event.person.firstName} ${event.person.lastName ?? ""}`.trim() : "",
      event.vehicle ? `${event.vehicle.plate}${event.vehicle.tagCode ? ` / ${event.vehicle.tagCode}` : ""}` : "",
      event.invitation ? `${event.invitation.guestName} (${event.invitation.code})` : "",
      event.method,
      event.direction === "ENTRY" ? "Entrada" : "Salida",
      event.decision === "ALLOWED" ? "Permitido" : "Denegado",
      event.guard ? `${event.guard.name} ${event.guard.lastName ?? ""}`.trim() : "",
      event.reason ? ACCESS_REASON_LABEL[event.reason] ?? event.reason : "",
    ] as string[],
  }));
};

export const exportAccessEventsCsv = async (query: AccessExportQuery, scope: ClientScope | undefined) => {
  const rows = (await accessEventExportRows(query, scope)).map((row) => [row.occurredAt.toISOString(), ...row.cells]);
  return `\uFEFF${[ACCESS_EXPORT_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
};
