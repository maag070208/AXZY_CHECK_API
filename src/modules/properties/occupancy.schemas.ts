import { z } from "zod";
import { emptyable, flag, positiveId } from "@src/core/validation/common";

export const changeOccupancyBody = z.object({
  status: z.string().trim().min(1, "es obligatorio").max(40),
  tenantPersonId: emptyable(positiveId),
  ownerPersonId: emptyable(positiveId),
  releaseResidents: flag.optional(),
  notes: z.string().trim().max(500).nullish(),
});

export const changeOwnershipBody = z.object({
  toPersonId: positiveId,
  notes: z.string().trim().max(500).nullish(),
});
