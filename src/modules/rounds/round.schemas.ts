import { z } from "zod";
import { emptyable, positiveId } from "@src/core/validation/common";

export const startRoundBody = z.object({
  recurringConfigId: emptyable(positiveId),
  clientRef: z.string().max(100).nullish(),
  startedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").nullish(),
});

export const endRoundBody = z.object({
  endedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").nullish(),
});
