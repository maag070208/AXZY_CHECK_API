import {
  ChargeCategory,
  ChargeStatus,
  CollectionFrequency,
  LateFeeType,
  Prisma,
} from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { ClientScope, scopeByClient, scopeByProperty } from "@src/core/scope/client-scope";
import { createCharge } from "../finance/finance.service";
import type {
  ApplyLateFeesInput,
  CollectionConfigInput,
  GenerateCollectionInput,
  UpdateCollectionConfigInput,
} from "./collections.schemas";

const PROPERTY_SELECT = { select: { id: true, identifier: true, name: true } } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const FREQUENCY_MONTHS: Record<CollectionFrequency, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  FOUR_MONTHLY: 4,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

const asNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const toMoney = (value: number) => new Prisma.Decimal(round2(value).toFixed(2));
const dateOnly = (value: Date | string) => {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
};
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Suma meses conservando el día de vencimiento (1-28). */
const advanceDate = (date: Date, frequency: CollectionFrequency, dueDay: number): Date => {
  const months = FREQUENCY_MONTHS[frequency];
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const normalized = new Date(Date.UTC(year, month, 1));
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), Math.min(dueDay, 28)));
};

const serialize = (config: {
  id: number;
  propertyId: number;
  concept: string;
  amount: Prisma.Decimal;
  frequency: CollectionFrequency;
  dueDay: number;
  nextChargeDate: Date;
  graceDays: number;
  lateFeeType: LateFeeType;
  lateFeeValue: Prisma.Decimal;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  property?: { id: number; identifier: string; name: string } | null;
}) => ({
  ...config,
  amount: round2(asNumber(config.amount)),
  lateFeeValue: round2(asNumber(config.lateFeeValue)),
  nextChargeDate: config.nextChargeDate.toISOString().slice(0, 10),
});

/**
 * Filtro por el cliente del alcance para las filas que llegan al cliente por su propiedad.
 * `scope === undefined` solo lo usa el job interno de cobranza (no hay petición ni alcance);
 * todos los controladores pasan siempre `req.scope`.
 */
const byScope = (scope: ClientScope | undefined): { property?: { clientId: number } } =>
  scope ? scopeByProperty(scope) : {};

/**
 * Valida la propiedad que referencia una configuración de cobranza: tiene que ser del cliente
 * del alcance. De otro cliente (o inexistente) responde 400, sin revelar si existe; sin cliente, 403.
 */
const ensurePropertyInScope = async (propertyId: number, scope: ClientScope | undefined) => {
  const clientId = scope ? scopeByClient(scope).clientId : undefined;
  const property = await prismaClient.property.findFirst({
    where: { id: propertyId, softDelete: false, ...(clientId === undefined ? {} : { clientId }) },
    select: { id: true },
  });
  if (!property) {
    throw new AppError(
      "PROPERTY_NOT_IN_CLIENT",
      "La propiedad no pertenece al cliente seleccionado",
      400,
    );
  }
  return property;
};

const validateLateFee = (type: LateFeeType, value: number) => {
  if (type !== LateFeeType.NONE && round2(value) <= 0) {
    throw new AppError("INVALID_LATE_FEE", "El recargo debe ser mayor a 0", 400);
  }
};

export const listCollectionConfigs = async (scope: ClientScope | undefined) => {
  const rows = await prismaClient.collectionConfig.findMany({
    where: { ...scopeByProperty(scope) },
    include: { property: PROPERTY_SELECT },
    orderBy: { propertyId: "asc" },
  });
  return rows.map(serialize);
};

export const upsertCollectionConfig = async (input: CollectionConfigInput, scope: ClientScope | undefined) => {
  // Multicliente: la propiedad de la configuración tiene que ser del cliente del alcance.
  await ensurePropertyInScope(input.propertyId, scope);
  validateLateFee(input.lateFeeType, input.lateFeeValue);

  const data = {
    concept: input.concept.trim(),
    amount: toMoney(input.amount),
    frequency: input.frequency,
    dueDay: input.dueDay,
    nextChargeDate: dateOnly(input.nextChargeDate),
    graceDays: input.graceDays,
    lateFeeType: input.lateFeeType,
    lateFeeValue: toMoney(input.lateFeeValue),
    active: input.active,
  };

  const config = await prismaClient.collectionConfig.upsert({
    where: { propertyId: input.propertyId },
    create: { propertyId: input.propertyId, ...data },
    update: data,
    include: { property: PROPERTY_SELECT },
  });
  return serialize(config);
};

export const updateCollectionConfig = async (
  id: number,
  input: UpdateCollectionConfigInput,
  scope: ClientScope | undefined,
) => {
  // Multicliente: una configuración de otro cliente responde 404, como si no existiera.
  const current = await prismaClient.collectionConfig.findFirst({
    where: { id, ...scopeByProperty(scope) },
  });
  if (!current) throw new AppError("COLLECTION_CONFIG_NOT_FOUND", "Configuración de cobranza no encontrada", 404);

  const lateFeeType = input.lateFeeType ?? current.lateFeeType;
  const lateFeeValue = input.lateFeeValue ?? asNumber(current.lateFeeValue);
  validateLateFee(lateFeeType, lateFeeValue);

  const config = await prismaClient.collectionConfig.update({
    where: { id },
    data: {
      ...(input.concept !== undefined && { concept: input.concept.trim() }),
      ...(input.amount !== undefined && { amount: toMoney(input.amount) }),
      ...(input.frequency !== undefined && { frequency: input.frequency }),
      ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
      ...(input.nextChargeDate !== undefined && { nextChargeDate: dateOnly(input.nextChargeDate) }),
      ...(input.graceDays !== undefined && { graceDays: input.graceDays }),
      ...(input.lateFeeType !== undefined && { lateFeeType: input.lateFeeType }),
      ...(input.lateFeeValue !== undefined && { lateFeeValue: toMoney(input.lateFeeValue) }),
      ...(input.active !== undefined && { active: input.active }),
    },
    include: { property: PROPERTY_SELECT },
  });
  return serialize(config);
};

/**
 * Genera los cargos CUOTA que ya tocan según `nextChargeDate` y avanza la fecha
 * según la frecuencia. Es idempotente por `propertyId + period`.
 */
export const generateCollectionCharges = async (
  actorId: number,
  input: GenerateCollectionInput,
  scope?: ClientScope,
) => {
  const target = dateOnly(input.throughDate ?? todayISO());
  // Multicliente: solo se recorren configuraciones de propiedades del cliente del alcance. Si se
  // pidió una propiedad de otro cliente, la referencia es ajena → 400.
  if (input.propertyId) await ensurePropertyInScope(input.propertyId, scope);
  const configs = await prismaClient.collectionConfig.findMany({
    where: { active: true, ...(input.propertyId ? { propertyId: input.propertyId } : {}), ...byScope(scope) },
    orderBy: { propertyId: "asc" },
  });

  const results: Array<{
    configId: number;
    propertyId: number;
    status: string;
    chargeId?: number;
    period?: string;
    message?: string;
  }> = [];

  for (const config of configs) {
    let next = config.nextChargeDate;
    let iterations = 0;
    let blocked = false;

    while (next <= target && iterations < 60 && !blocked) {
      iterations += 1;
      const period = next.toISOString().slice(0, 7);
      try {
        const charge = await createCharge(
          { id: actorId, canManage: true },
          {
            propertyId: config.propertyId,
            concept: config.concept,
            category: ChargeCategory.CUOTA,
            amount: asNumber(config.amount),
            dueDate: next.toISOString().slice(0, 10),
            period,
          },
          scope,
        );
        results.push({ configId: config.id, propertyId: config.propertyId, status: "created", chargeId: charge.id, period });
      } catch (error: any) {
        if (error?.code === "NO_RESIDENT" || error?.code === "PERIOD_ALREADY_CHARGED") {
          results.push({
            configId: config.id,
            propertyId: config.propertyId,
            status: error.code === "NO_RESIDENT" ? "skipped_no_resident" : "skipped",
            period,
          });
          if (error.code === "NO_RESIDENT") blocked = true;
        } else {
          results.push({
            configId: config.id,
            propertyId: config.propertyId,
            status: "error",
            period,
            message: error?.message ?? "Error al generar el cargo",
          });
          blocked = true;
        }
      }

      if (!blocked) {
        next = advanceDate(next, config.frequency, config.dueDay);
        await prismaClient.collectionConfig.update({ where: { id: config.id }, data: { nextChargeDate: next } });
      }
    }

    if (iterations >= 60 && next <= target) {
      results.push({
        configId: config.id,
        propertyId: config.propertyId,
        status: "error",
        message: "Demasiados periodos pendientes; revisa la fecha de próximo cobro",
      });
    }
  }

  return {
    created: results.filter((row) => row.status === "created").length,
    skipped: results.filter((row) => row.status !== "created").length,
    results,
  };
};

/**
 * Crea un cargo RECARGO por cada cargo vencido que ya pasó los días de gracia y
 * aún no tiene recargo. El recargo es único por cargo (`sourceChargeId` único).
 */
export const applyLateFees = async (
  actorId: number,
  input: ApplyLateFeesInput,
  scope?: ClientScope,
) => {
  const today = dateOnly(todayISO());
  // Multicliente: solo configuraciones de propiedades del cliente del alcance; propiedad ajena → 400.
  if (input.propertyId) await ensurePropertyInScope(input.propertyId, scope);
  const configs = await prismaClient.collectionConfig.findMany({
    where: {
      active: true,
      lateFeeType: { not: LateFeeType.NONE },
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      ...byScope(scope),
    },
    orderBy: { propertyId: "asc" },
  });

  const results: Array<{
    configId: number;
    propertyId: number;
    chargeId?: number;
    lateFeeChargeId?: number;
    amount?: number;
    status: string;
    message?: string;
  }> = [];

  for (const config of configs) {
    const cutoff = new Date(today.getTime() - config.graceDays * DAY_MS);
    const charges = await prismaClient.charge.findMany({
      where: {
        propertyId: config.propertyId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.PARTIAL] },
        dueDate: { lt: cutoff },
        category: { not: ChargeCategory.RECARGO },
        recargos: { none: {} },
      },
      select: { id: true, residentId: true, concept: true, amount: true },
      orderBy: { dueDate: "asc" },
    });

    for (const charge of charges) {
      const paid = await prismaClient.paymentAllocation.aggregate({
        where: { chargeId: charge.id, payment: { voidedAt: null } },
        _sum: { amount: true },
      });
      const outstanding = round2(asNumber(charge.amount) - asNumber(paid._sum.amount));
      if (outstanding <= 0) {
        results.push({ configId: config.id, propertyId: config.propertyId, chargeId: charge.id, status: "skipped" });
        continue;
      }

      const amount =
        config.lateFeeType === LateFeeType.PERCENT
          ? round2((outstanding * asNumber(config.lateFeeValue)) / 100)
          : round2(asNumber(config.lateFeeValue));
      if (amount <= 0) {
        results.push({ configId: config.id, propertyId: config.propertyId, chargeId: charge.id, status: "skipped" });
        continue;
      }

      try {
        const lateFee = await prismaClient.charge.create({
          data: {
            propertyId: config.propertyId,
            residentId: charge.residentId,
            concept: `Recargo por atraso: ${charge.concept}`,
            category: ChargeCategory.RECARGO,
            amount: toMoney(amount),
            dueDate: today,
            period: null,
            sourceChargeId: charge.id,
            notes: `Recargo ${config.lateFeeType === LateFeeType.PERCENT ? `${asNumber(config.lateFeeValue)}%` : "fijo"} sobre saldo vencido.`,
            createdById: actorId,
          },
          select: { id: true },
        });
        results.push({
          configId: config.id,
          propertyId: config.propertyId,
          chargeId: charge.id,
          lateFeeChargeId: lateFee.id,
          amount,
          status: "created",
        });
      } catch (error: any) {
        results.push({
          configId: config.id,
          propertyId: config.propertyId,
          chargeId: charge.id,
          status: error?.code === "P2002" ? "skipped" : "error",
          message: error?.message,
        });
      }
    }
  }

  return {
    created: results.filter((row) => row.status === "created").length,
    skipped: results.filter((row) => row.status !== "created").length,
    results,
  };
};
