import { z } from "zod";
import { emptyable, positiveId } from "@src/core/validation/common";

export const startRoundBody = z.object({
  recurringConfigId: emptyable(positiveId),
  clientRef: z.string().max(100).nullish(),
  startedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").nullish(),
  // Regla: una ronda nunca se inicia como efecto secundario de otro flujo.
  confirmed: z.boolean().refine((v) => v === true, "Debes confirmar el inicio de la ronda."),
}).strict();

export const endRoundBody = z.object({
  endedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").nullish(),
});
