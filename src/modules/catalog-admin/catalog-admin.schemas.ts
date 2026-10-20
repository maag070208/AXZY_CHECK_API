import { z } from "zod";
import { emptyable, flag, positiveId } from "@src/core/validation/common";

const name = z.string().trim().min(1, "es obligatorio").max(60);
const value = z.string().trim().min(1, "es obligatorio").max(120);
const reorder = z.object({ ids: z.array(positiveId).min(1) });

export const createCategoryBody = z.object({
  name,
  value,
  type: z.string().trim().max(40).nullish(),
  color: z.string().trim().max(20).nullish(),
  icon: z.string().trim().max(40).nullish(),
});

export const updateCategoryBody = z.object({
  name: name.optional(),
  value: value.optional(),
  color: z.string().trim().max(20).nullish(),
  icon: z.string().trim().max(40).nullish(),
  active: flag.optional(),
});

export const createTypeBody = z.object({
  name,
  value,
  categoryId: positiveId,
});

export const updateTypeBody = z.object({
  name: name.optional(),
  value: value.optional(),
  categoryId: emptyable(positiveId),
  active: flag.optional(),
});

export const reorderBody = reorder;
