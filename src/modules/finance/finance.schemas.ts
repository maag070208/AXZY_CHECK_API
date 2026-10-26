import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

export const CHARGE_CATEGORIES = ["CUOTA", "MANTENIMIENTO", "EXTRA", "RECARGO"] as const;
export const CHARGE_STATUSES = ["PENDING", "PARTIAL", "PAID", "CANCELLED"] as const;
export const PAYMENT_METHODS = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "AJUSTE"] as const;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato YYYY-MM-DD");
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "usa el formato YYYY-MM");
const money = z.coerce.number().positive("debe ser mayor a 0").max(9_999_999.99, "monto demasiado grande");

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const listChargesQuery = z.object({
  ...pagination,
  propertyId: positiveId.optional(),
  residentId: positiveId.optional(),
  status: z.enum(CHARGE_STATUSES).optional(),
  category: z.enum(CHARGE_CATEGORIES).optional(),
  period: period.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().trim().max(120).optional(),
});

export const createChargeBody = z
  .object({
    propertyId: positiveId,
    residentId: positiveId.optional(),
    concept: z.string().trim().min(3, "debe tener al menos 3 caracteres").max(160),
    category: z.enum(CHARGE_CATEGORIES),
    amount: money,
    dueDate: dateOnly,
    period: period.nullish(),
    notes: z.string().trim().max(1000).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.category === "CUOTA" && !value.period) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["period"], message: "la cuota requiere un periodo" });
    }
    if (value.category !== "CUOTA" && value.period) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["period"], message: "solo la cuota lleva periodo" });
    }
  });

export const monthlyChargesBody = z
  .object({
    period,
    amount: money,
    dueDate: dateOnly,
    concept: z.string().trim().min(3).max(160).optional(),
    propertyIds: z.array(positiveId).max(500).optional(),
  })
  .strict();

export const cancelChargeBody = z
  .object({
    reason: z.string().trim().min(3, "explica el motivo").max(500),
  })
  .strict();

export const listPaymentsQuery = z.object({
  ...pagination,
  propertyId: positiveId.optional(),
  residentId: positiveId.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().trim().max(120).optional(),
});

export const createPaymentBody = z
  .object({
    propertyId: positiveId,
    residentId: positiveId.optional(),
    amount: money,
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().max(120).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    paidAt: z.union([dateOnly, z.string().datetime({ offset: true })]).optional(),
    chargeIds: z.array(positiveId).max(200).optional(),
    allowOverpayment: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.method === "AJUSTE" && !value.notes?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "el ajuste requiere una nota" });
    }
  });

export const voidPaymentBody = z
  .object({
    reason: z.string().trim().min(3, "explica el motivo").max(500),
  })
  .strict();
