import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato YYYY-MM-DD");

export const COLLECTION_FREQUENCIES = [
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "FOUR_MONTHLY",
  "SEMIANNUAL",
  "ANNUAL",
] as const;

export const LATE_FEE_TYPES = ["NONE", "FIXED", "PERCENT"] as const;

export const collectionConfigBody = z
  .object({
    propertyId: positiveId,
    concept: z.string().trim().min(3, "debe tener al menos 3 caracteres").max(160),
    amount: z.coerce.number().positive("debe ser mayor a 0").max(9_999_999.99),
    frequency: z.enum(COLLECTION_FREQUENCIES),
    dueDay: z.coerce.number().int().min(1).max(28),
    nextChargeDate: dateOnly,
    graceDays: z.coerce.number().int().min(0).max(90).default(5),
    lateFeeType: z.enum(LATE_FEE_TYPES).default("NONE"),
    lateFeeValue: z.coerce.number().min(0).max(9_999_999.99).default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const updateCollectionConfigBody = collectionConfigBody
  .omit({ propertyId: true })
  .partial()
  .strict();

export const generateCollectionBody = z
  .object({
    propertyId: positiveId.optional(),
    throughDate: dateOnly.optional(),
  })
  .strict();

export const applyLateFeesBody = z
  .object({
    propertyId: positiveId.optional(),
  })
  .strict();

export type CollectionConfigInput = z.infer<typeof collectionConfigBody>;
export type UpdateCollectionConfigInput = z.infer<typeof updateCollectionConfigBody>;
export type GenerateCollectionInput = z.infer<typeof generateCollectionBody>;
export type ApplyLateFeesInput = z.infer<typeof applyLateFeesBody>;
