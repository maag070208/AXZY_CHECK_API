import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "debe tener formato HH:mm");
const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida");

export const authorizationBody = z
  .object({
    personId: positiveId,
    scope: z.enum(["PEDESTRIAN", "VEHICLE", "BOTH"]).default("PEDESTRIAN"),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: hhmm,
    endTime: hhmm,
    validFrom: date,
    validUntil: date.nullish(),
  })
  .refine((v) => !v.validUntil || Date.parse(v.validUntil) >= Date.parse(v.validFrom), {
    message: "la vigencia final debe ser posterior a la inicial",
    path: ["validUntil"],
  });
