import { ChargeCategory, ChargeStatus, Prisma, ResidentStatus } from "@prisma/client";
import type { z } from "zod";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { findResidentPropertyId } from "../residents/resident-property.service";
import type {
  createChargeBody,
  createPaymentBody,
  listChargesQuery,
  listPaymentsQuery,
  monthlyChargesBody,
} from "./finance.schemas";

export type FinanceActor = { id: number; canManage: boolean };
export type CreateChargeInput = z.infer<typeof createChargeBody>;
export type MonthlyChargesInput = z.infer<typeof monthlyChargesBody>;
export type ListChargesInput = z.output<typeof listChargesQuery>;
export type CreatePaymentInput = z.infer<typeof createPaymentBody>;
export type ListPaymentsInput = z.output<typeof listPaymentsQuery>;

const asNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const toMoney = (value: number) => new Prisma.Decimal(round2(value).toFixed(2));
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/** Folio consecutivo por residencial, con bloqueo de fila para no dejar huecos. */
const nextPaymentFolio = async (tx: Prisma.TransactionClient): Promise<number> => {
  await tx.$executeRaw`
    INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
    VALUES ('payment_folio', 0, NOW())
    ON CONFLICT ("key") DO NOTHING
  `;
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>`
    SELECT "lastValue" FROM "DocumentSequence" WHERE "key" = 'payment_folio' FOR UPDATE
  `;
  const next = Number(rows[0]?.lastValue ?? 0) + 1;
  await tx.documentSequence.update({ where: { key: 'payment_folio' }, data: { lastValue: next } });
  return next;
};

/** Asigna folio a un pago viejo que aún no lo tenga (recibos previos a la fase 4). */
export const ensurePaymentFolio = async (paymentId: number): Promise<number> => {
  return prismaClient.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { folio: true } });
    if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "Pago no encontrado", 404);
    if (payment.folio) return payment.folio;
    const folio = await nextPaymentFolio(tx);
    await tx.payment.update({ where: { id: paymentId }, data: { folio } });
    return folio;
  });
};
const paidAtDate = (value?: string) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value) : new Date();

const PROPERTY_SELECT = { select: { id: true, identifier: true, name: true } } as const;
const RESIDENT_SELECT = { select: { id: true, name: true, lastName: true, username: true } } as const;
const USER_SELECT = { select: { id: true, name: true, lastName: true } } as const;

export const residentPropertyId = (userId: number): Promise<number | null> => findResidentPropertyId(userId);

const ensureProperty = async (propertyId: number) => {
  const property = await prismaClient.property.findFirst({
    where: { id: propertyId, softDelete: false },
    select: { id: true },
  });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
};

/**
 * Resuelve el residente titular de una propiedad. Si viene `residentId`, valida
 * que tenga un vínculo activo con la propiedad; si no, usa al titular.
 */
const resolveResidentId = async (propertyId: number, residentId?: number): Promise<number> => {
  if (residentId) {
    const link = await prismaClient.resident.findFirst({
      where: { propertyId, status: ResidentStatus.ACTIVE, person: { userId: residentId } },
      select: { id: true },
    });
    if (!link) {
      throw new AppError("RESIDENT_NOT_IN_PROPERTY", "El residente no pertenece a la propiedad", 400);
    }
    return residentId;
  }

  const primary = await prismaClient.resident.findFirst({
    where: { propertyId, status: ResidentStatus.ACTIVE, person: { userId: { not: null } } },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    select: { person: { select: { userId: true } } },
  });
  const id = primary?.person.userId;
  if (!id) throw new AppError("NO_RESIDENT", "La propiedad no tiene un residente activo", 400);
  return id;
};

/** Cliente mínimo compartido entre Prisma y una transacción. */
type FinanceDb = Pick<typeof prismaClient, "charge" | "paymentAllocation" | "payment">;

/** Suma pagada por cargo, ignorando pagos reversados. */
const paidByCharge = async (chargeIds: number[], db: FinanceDb = prismaClient): Promise<Map<number, number>> => {
  if (!chargeIds.length) return new Map();
  const rows = await db.paymentAllocation.groupBy({
    by: ["chargeId"],
    where: { chargeId: { in: chargeIds }, payment: { voidedAt: null } },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [row.chargeId, round2(asNumber(row._sum.amount))]));
};

const creditForResident = async (residentId: number): Promise<number> => {
  const row = await prismaClient.payment.aggregate({
    where: { residentId, voidedAt: null },
    _sum: { unallocatedAmount: true },
  });
  return round2(asNumber(row._sum.unallocatedAmount));
};

const withChargeAmounts = (row: any, paid: number) => {
  const amount = round2(asNumber(row.amount));
  return {
    ...row,
    amount,
    paidAmount: paid,
    outstanding: row.status === ChargeStatus.CANCELLED ? 0 : Math.max(round2(amount - paid), 0),
  };
};

/** Actualiza PENDING/PARTIAL/PAID de los cargos tocados por un pago o una reversa. */
const refreshChargeStatuses = async (tx: Prisma.TransactionClient, chargeIds: number[]) => {
  const unique = Array.from(new Set(chargeIds));
  for (const chargeId of unique) {
    const charge = await tx.charge.findUnique({
      where: { id: chargeId },
      select: { amount: true, status: true },
    });
    if (!charge || charge.status === ChargeStatus.CANCELLED) continue;

    const paid = await tx.paymentAllocation.aggregate({
      where: { chargeId, payment: { voidedAt: null } },
      _sum: { amount: true },
    });
    const paidAmount = round2(asNumber(paid._sum.amount));
    const amount = round2(asNumber(charge.amount));
    const status =
      paidAmount >= amount ? ChargeStatus.PAID : paidAmount > 0 ? ChargeStatus.PARTIAL : ChargeStatus.PENDING;

    if (status !== charge.status) {
      await tx.charge.update({ where: { id: chargeId }, data: { status } });
    }
  }
};

export const listCharges = async (actor: FinanceActor, query: ListChargesInput) => {
  const where: Prisma.ChargeWhereInput = {
    // El residente nunca puede pedir los cargos de otro: su id manda sobre el filtro.
    ...(actor.canManage
      ? query.residentId
        ? { residentId: query.residentId }
        : {}
      : { residentId: actor.id }),
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.period ? { period: query.period } : {}),
    ...(query.from || query.to
      ? {
          dueDate: {
            ...(query.from ? { gte: dateOnly(query.from) } : {}),
            ...(query.to ? { lte: dateOnly(query.to) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { concept: { contains: query.search, mode: "insensitive" } },
            { resident: { name: { contains: query.search, mode: "insensitive" } } },
            { resident: { lastName: { contains: query.search, mode: "insensitive" } } },
            { property: { identifier: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await prismaClient.$transaction([
    prismaClient.charge.findMany({
      where,
      orderBy: [{ dueDate: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { property: PROPERTY_SELECT, resident: RESIDENT_SELECT },
    }),
    prismaClient.charge.count({ where }),
  ]);

  const paid = await paidByCharge(rows.map((row) => row.id));
  return { data: rows.map((row) => withChargeAmounts(row, paid.get(row.id) ?? 0)), total };
};

export const createCharge = async (actor: FinanceActor, input: CreateChargeInput) => {
  await ensureProperty(input.propertyId);
  const residentId = await resolveResidentId(input.propertyId, input.residentId);
  const amount = round2(input.amount);
  if (amount <= 0) throw new AppError("INVALID_AMOUNT", "El monto debe ser mayor a 0", 400);

  try {
    const charge = await prismaClient.charge.create({
      data: {
        propertyId: input.propertyId,
        residentId,
        concept: input.concept.trim(),
        category: input.category,
        amount: toMoney(amount),
        dueDate: dateOnly(input.dueDate),
        period: input.category === "CUOTA" ? input.period ?? null : null,
        notes: input.notes?.trim() || null,
        createdById: actor.id,
      },
      include: { property: PROPERTY_SELECT, resident: RESIDENT_SELECT },
    });
    return withChargeAmounts(charge, 0);
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw new AppError(
        "PERIOD_ALREADY_CHARGED",
        "Ya existe una cuota para ese periodo en la propiedad",
        409,
      );
    }
    throw error;
  }
};

export const generateMonthlyCharges = async (actor: FinanceActor, input: MonthlyChargesInput) => {
  const amount = round2(input.amount);
  if (amount <= 0) throw new AppError("INVALID_AMOUNT", "El monto debe ser mayor a 0", 400);

  const properties = await prismaClient.property.findMany({
    where: {
      softDelete: false,
      ...(input.propertyIds?.length ? { id: { in: input.propertyIds } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (properties.length === 0) return { created: 0, skipped: 0, results: [] };

  const propertyIds = properties.map((property) => property.id);

  // Una sola lectura de titulares y cuotas existentes evita 2-3 consultas por propiedad.
  const residents = await prismaClient.resident.findMany({
    where: { propertyId: { in: propertyIds }, status: ResidentStatus.ACTIVE, property: { softDelete: false } },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    select: { propertyId: true, person: { select: { userId: true } } },
  });
  const residentByProperty = new Map<number, number>();
  for (const resident of residents) {
    if (!residentByProperty.has(resident.propertyId) && resident.person?.userId) {
      residentByProperty.set(resident.propertyId, resident.person.userId);
    }
  }

  const existing = await prismaClient.charge.findMany({
    where: { propertyId: { in: propertyIds }, period: input.period },
    select: { propertyId: true },
  });
  const existingSet = new Set(existing.map((charge) => charge.propertyId));

  const concept = input.concept?.trim() || `Cuota mensual ${input.period}`;
  const candidates = properties.filter(
    (property) => residentByProperty.has(property.id) && !existingSet.has(property.id),
  );

  if (candidates.length > 0) {
    await prismaClient.charge.createMany({
      data: candidates.map((property) => ({
        propertyId: property.id,
        residentId: residentByProperty.get(property.id)!,
        concept,
        category: ChargeCategory.CUOTA,
        amount: toMoney(amount),
        dueDate: dateOnly(input.dueDate),
        period: input.period,
        createdById: actor.id,
      })),
      skipDuplicates: true,
    });
  }

  const createdCharges = candidates.length
    ? await prismaClient.charge.findMany({
        where: { propertyId: { in: candidates.map((property) => property.id) }, period: input.period },
        select: { id: true, propertyId: true },
      })
    : [];
  const createdByProperty = new Map(createdCharges.map((charge) => [charge.propertyId, charge.id]));

  const results = properties.map((property) => {
    if (!residentByProperty.has(property.id)) {
      return { propertyId: property.id, status: "skipped_no_resident" };
    }
    if (existingSet.has(property.id)) {
      return { propertyId: property.id, status: "skipped" };
    }
    const chargeId = createdByProperty.get(property.id);
    return chargeId
      ? { propertyId: property.id, status: "created", chargeId }
      : { propertyId: property.id, status: "skipped" };
  });

  return {
    created: results.filter((row) => row.status === "created").length,
    skipped: results.filter((row) => row.status !== "created").length,
    results,
  };
};

export const cancelCharge = async (id: number, reason: string) => {
  const charge = await prismaClient.charge.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!charge) throw new AppError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
  if (charge.status === ChargeStatus.CANCELLED) {
    throw new AppError("CHARGE_ALREADY_CANCELLED", "El cargo ya está cancelado", 409);
  }

  const paid = await prismaClient.paymentAllocation.aggregate({
    where: { chargeId: id, payment: { voidedAt: null } },
    _sum: { amount: true },
  });
  if (asNumber(paid._sum.amount) > 0) {
    throw new AppError(
      "CHARGE_HAS_PAYMENTS",
      "El cargo tiene pagos aplicados; primero registra la reversa del pago",
      409,
    );
  }

  const updated = await prismaClient.charge.update({
    where: { id },
    data: {
      status: ChargeStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledReason: reason.trim(),
    },
    include: { property: PROPERTY_SELECT, resident: RESIDENT_SELECT },
  });
  return withChargeAmounts(updated, 0);
};

export const listPayments = async (actor: FinanceActor, query: ListPaymentsInput) => {
  // `OR` de visibilidad y `OR` de búsqueda deben convivir: se combinan con AND.
  const and: Prisma.PaymentWhereInput[] = [];
  if (!actor.canManage) {
    and.push({
      OR: [
        { residentId: actor.id },
        { allocations: { some: { charge: { residentId: actor.id } } } },
      ],
    });
  }
  if (query.search) {
    and.push({
      OR: [
        { reference: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
        { property: { identifier: { contains: query.search, mode: "insensitive" } } },
        { resident: { name: { contains: query.search, mode: "insensitive" } } },
      ],
    });
  }

  const where: Prisma.PaymentWhereInput = {
    ...(and.length ? { AND: and } : {}),
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.residentId ? { residentId: query.residentId } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.from || query.to
      ? {
          paidAt: {
            ...(query.from ? { gte: dateOnly(query.from) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await prismaClient.$transaction([
    prismaClient.payment.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        property: PROPERTY_SELECT,
        resident: RESIDENT_SELECT,
        registeredBy: USER_SELECT,
        voidedBy: USER_SELECT,
        allocations: {
          select: {
            id: true,
            amount: true,
            chargeId: true,
            charge: { select: { concept: true, residentId: true } },
          },
        },
      },
    }),
    prismaClient.payment.count({ where }),
  ]);

  return {
    data: rows.map((row) => {
      const allocations = row.allocations.map((allocation) => ({
        ...allocation,
        amount: round2(asNumber(allocation.amount)),
      }));
      const allocatedAmount = round2(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
      const appliedAmount = actor.canManage
        ? allocatedAmount
        : round2(
            allocations
              .filter((allocation) => allocation.charge.residentId === actor.id)
              .reduce((sum, allocation) => sum + allocation.amount, 0),
          );

      return {
        ...row,
        amount: round2(asNumber(row.amount)),
        unallocatedAmount: round2(asNumber(row.unallocatedAmount)),
        allocatedAmount,
        appliedAmount,
        allocations,
      };
    }),
    total,
  };
};

type TargetCharge = {
  id: number;
  residentId: number;
  concept: string;
  amount: number;
  outstanding: number;
};

const resolveTargetCharges = async (
  input: CreatePaymentInput,
  db: FinanceDb = prismaClient,
): Promise<TargetCharge[]> => {
  const chargeIds = input.chargeIds ?? [];
  const charges = await db.charge.findMany({
    where: {
      propertyId: input.propertyId,
      status: { not: ChargeStatus.CANCELLED },
      ...(input.residentId ? { residentId: input.residentId } : {}),
      ...(chargeIds.length ? { id: { in: chargeIds } } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    select: { id: true, residentId: true, concept: true, amount: true },
  });

  if (chargeIds.length) {
    const found = new Set(charges.map((charge) => charge.id));
    const missing = chargeIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new AppError(
        "CHARGE_NOT_FOUND",
        "Uno o más cargos no existen, están cancelados o no son de la propiedad",
        400,
      );
    }
  }

  if (input.residentId && charges.some((charge) => charge.residentId !== input.residentId)) {
    throw new AppError("RESIDENT_NOT_IN_PROPERTY", "Los cargos no pertenecen al residente indicado", 400);
  }

  const paid = await paidByCharge(charges.map((charge) => charge.id), db);
  return charges
    .map((charge) => {
      const amount = round2(asNumber(charge.amount));
      return {
        id: charge.id,
        residentId: charge.residentId,
        concept: charge.concept,
        amount,
        outstanding: Math.max(round2(amount - (paid.get(charge.id) ?? 0)), 0),
      };
    })
    .filter((charge) => charge.outstanding > 0);
};

export const createPayment = async (actor: FinanceActor, input: CreatePaymentInput) => {
  await ensureProperty(input.propertyId);
  const amount = round2(input.amount);
  if (amount <= 0) throw new AppError("INVALID_AMOUNT", "El monto debe ser mayor a 0", 400);

  if (input.residentId) {
    const link = await prismaClient.resident.findFirst({
      where: {
        propertyId: input.propertyId,
        status: ResidentStatus.ACTIVE,
        person: { userId: input.residentId },
      },
      select: { id: true },
    });
    if (!link) {
      throw new AppError("RESIDENT_NOT_IN_PROPERTY", "El residente no pertenece a la propiedad", 400);
    }
  }

  return prismaClient.$transaction(async (tx) => {
    // El folio bloquea la fila de secuencia: serializa la asignación de folios y
    // también la lectura/asignación de cargos, evitando sobrepagos concurrentes.
    const folio = await nextPaymentFolio(tx);

    const targets = await resolveTargetCharges(input, tx);
    const totalOutstanding = round2(targets.reduce((sum, charge) => sum + charge.outstanding, 0));

    if (totalOutstanding === 0 && !input.allowOverpayment) {
      throw new AppError("NO_OUTSTANDING_CHARGES", "No hay cargos pendientes para aplicar el pago", 409);
    }
    if (!input.allowOverpayment && amount > totalOutstanding) {
      throw new AppError(
        "PAYMENT_EXCEEDS_BALANCE",
        "El pago excede el saldo pendiente; confirma el saldo a favor",
        400,
      );
    }
    if (amount > totalOutstanding && !input.residentId) {
      throw new AppError(
        "RESIDENT_REQUIRED_FOR_CREDIT",
        "Indica el residente para registrar el saldo a favor",
        400,
      );
    }

    const allocations: Array<{ chargeId: number; amount: number }> = [];
    let remaining = amount;
    for (const charge of targets) {
      if (remaining <= 0) break;
      const applied = round2(Math.min(remaining, charge.outstanding));
      if (applied > 0) {
        allocations.push({ chargeId: charge.id, amount: applied });
        remaining = round2(remaining - applied);
      }
    }
    const unallocated = round2(remaining);

    const payment = await tx.payment.create({
      data: {
        propertyId: input.propertyId,
        residentId: input.residentId ?? null,
        folio,
        amount: toMoney(amount),
        method: input.method,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        paidAt: paidAtDate(input.paidAt),
        registeredById: actor.id,
        unallocatedAmount: toMoney(unallocated),
        allocations: {
          create: allocations.map((allocation) => ({
            chargeId: allocation.chargeId,
            amount: toMoney(allocation.amount),
          })),
        },
      },
      include: {
        property: PROPERTY_SELECT,
        resident: RESIDENT_SELECT,
        allocations: {
          select: {
            id: true,
            amount: true,
            chargeId: true,
            charge: { select: { concept: true, residentId: true } },
          },
        },
      },
    });

    await refreshChargeStatuses(tx, allocations.map((allocation) => allocation.chargeId));

    return {
      ...payment,
      amount: round2(asNumber(payment.amount)),
      unallocatedAmount: round2(asNumber(payment.unallocatedAmount)),
      allocations: payment.allocations.map((allocation) => ({
        ...allocation,
        amount: round2(asNumber(allocation.amount)),
      })),
    };
  });
};

export const voidPayment = async (actor: FinanceActor, id: number, reason: string) => {
  const payment = await prismaClient.payment.findUnique({
    where: { id },
    select: {
      id: true,
      voidedAt: true,
      allocations: { select: { chargeId: true } },
    },
  });
  if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "Pago no encontrado", 404);
  if (payment.voidedAt) {
    throw new AppError("PAYMENT_ALREADY_VOIDED", "El pago ya está reversado", 409);
  }

  const updated = await prismaClient.$transaction(async (tx) => {
    const result = await tx.payment.update({
      where: { id },
      data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason.trim() },
      include: {
        property: PROPERTY_SELECT,
        resident: RESIDENT_SELECT,
        voidedBy: USER_SELECT,
      },
    });
    await refreshChargeStatuses(tx, payment.allocations.map((allocation) => allocation.chargeId));
    return result;
  });

  return {
    ...updated,
    amount: round2(asNumber(updated.amount)),
    unallocatedAmount: round2(asNumber(updated.unallocatedAmount)),
  };
};

export const getResidentFinance = async (userId: number) => {
  const propertyId = await residentPropertyId(userId);

  const charges = await prismaClient.charge.findMany({
    where: { residentId: userId },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    include: { property: PROPERTY_SELECT },
  });

  const paid = await paidByCharge(charges.map((charge) => charge.id));
  const payments = await prismaClient.payment.findMany({
    where: {
      OR: [
        { residentId: userId },
        { allocations: { some: { charge: { residentId: userId } } } },
      ],
    },
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    include: {
      property: PROPERTY_SELECT,
      allocations: {
        where: { charge: { residentId: userId } },
        select: { id: true, amount: true, chargeId: true },
      },
    },
  });

  const credit = await creditForResident(userId);
  const activeCharges = charges.filter((charge) => charge.status !== ChargeStatus.CANCELLED);
  const totalCharges = round2(activeCharges.reduce((sum, charge) => sum + asNumber(charge.amount), 0));
  const applied = round2(
    activeCharges.reduce((sum, charge) => sum + (paid.get(charge.id) ?? 0), 0),
  );
  const totalPaid = round2(applied + credit);
  const balance = round2(totalCharges - totalPaid);

  const today = dateOnly(new Date().toISOString().slice(0, 10));

  return {
    summary: {
      currency: "MXN",
      propertyId,
      balance,
      totalCharges,
      totalPaid,
      applied,
      credit,
      pendingCharges: activeCharges.filter(
        (charge) => charge.status === ChargeStatus.PENDING || charge.status === ChargeStatus.PARTIAL,
      ).length,
    },
    charges: charges.map((charge) => {
      const paidAmount = paid.get(charge.id) ?? 0;
      const amount = round2(asNumber(charge.amount));
      const outstanding =
        charge.status === ChargeStatus.CANCELLED ? 0 : Math.max(round2(amount - paidAmount), 0);
      return {
        ...charge,
        amount,
        paidAmount,
        outstanding,
        overdue:
          outstanding > 0 &&
          charge.status !== ChargeStatus.CANCELLED &&
          charge.dueDate.getTime() < today.getTime(),
      };
    }),
    payments: payments.map((payment) => {
      const appliedAmount = round2(
        payment.allocations.reduce((sum, allocation) => sum + asNumber(allocation.amount), 0),
      );
      const paymentCredit =
        !payment.voidedAt && payment.residentId === userId
          ? round2(asNumber(payment.unallocatedAmount))
          : 0;
      return {
        ...payment,
        amount: round2(asNumber(payment.amount)),
        unallocatedAmount: round2(asNumber(payment.unallocatedAmount)),
        appliedAmount,
        credit: paymentCredit,
        allocations: payment.allocations.map((allocation) => ({
          ...allocation,
          amount: round2(asNumber(allocation.amount)),
        })),
      };
    }),
  };
};

export const getFinanceSummary = async () => {
  const [properties, charges, payments] = await Promise.all([
    prismaClient.property.findMany({
      where: { softDelete: false },
      orderBy: { identifier: "asc" },
      select: { id: true, identifier: true, name: true },
    }),
    prismaClient.charge.findMany({
      where: { status: { not: ChargeStatus.CANCELLED } },
      select: {
        propertyId: true,
        residentId: true,
        amount: true,
        status: true,
        allocations: { where: { payment: { voidedAt: null } }, select: { amount: true } },
      },
    }),
    prismaClient.payment.findMany({
      where: { voidedAt: null },
      select: { propertyId: true, unallocatedAmount: true },
    }),
  ]);

  const byProperty = new Map<
    number,
    { totalCharges: number; applied: number; credit: number; residents: Set<number>; pending: number }
  >();
  const entry = (propertyId: number) => {
    if (!byProperty.has(propertyId)) {
      byProperty.set(propertyId, {
        totalCharges: 0,
        applied: 0,
        credit: 0,
        residents: new Set(),
        pending: 0,
      });
    }
    return byProperty.get(propertyId)!;
  };

  for (const charge of charges) {
    const row = entry(charge.propertyId);
    row.totalCharges = round2(row.totalCharges + asNumber(charge.amount));
    row.residents.add(charge.residentId);
    if (charge.status === ChargeStatus.PENDING || charge.status === ChargeStatus.PARTIAL) {
      row.pending += 1;
    }
    row.applied = round2(
      row.applied + charge.allocations.reduce((sum, allocation) => sum + asNumber(allocation.amount), 0),
    );
  }
  for (const payment of payments) {
    const row = entry(payment.propertyId);
    row.credit = round2(row.credit + asNumber(payment.unallocatedAmount));
  }

  const items = properties.map((property) => {
    const row = byProperty.get(property.id);
    const totalCharges = row?.totalCharges ?? 0;
    const applied = row?.applied ?? 0;
    const credit = row?.credit ?? 0;
    const totalPaid = round2(applied + credit);
    return {
      ...property,
      totalCharges,
      applied,
      credit,
      totalPaid,
      balance: round2(totalCharges - totalPaid),
      residents: row?.residents.size ?? 0,
      pendingCharges: row?.pending ?? 0,
    };
  });

  return {
    items: items.sort((a, b) => b.balance - a.balance),
    totals: {
      properties: items.length,
      totalCharges: round2(items.reduce((sum, item) => sum + item.totalCharges, 0)),
      totalPaid: round2(items.reduce((sum, item) => sum + item.totalPaid, 0)),
      balance: round2(items.reduce((sum, item) => sum + item.balance, 0)),
    },
  };
};
