import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato YYYY-MM-DD");

export const accessStatusQuery = z.object({
  propertyId: positiveId,
});

export const delinquencyRuleBody = z
  .object({
    enabled: z.boolean(),
    minOverdueDays: z.coerce.number().int().min(0).max(365),
    blockVisitors: z.boolean(),
    active: z.boolean(),
  })
  .strict();

export const accessExceptionBody = z
  .object({
    propertyId: positiveId,
    reason: z.string().trim().min(3, "explica el motivo").max(300),
    validUntil: dateOnly,
  })
  .strict();

export const accessExceptionQuery = z.object({
  propertyId: positiveId.optional(),
});

export const accessEventsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  propertyId: positiveId.optional(),
  method: z.enum(["QR", "TAG", "PIN", "MANUAL"]).optional(),
  decision: z.enum(["ALLOWED", "DENIED"]).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
