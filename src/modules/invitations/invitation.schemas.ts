import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

export const createInvitationBody = z
  .object({
    guestName: z.string().trim().min(1, "es obligatorio").max(120),
    propertyId: positiveId,
    typeId: positiveId,
    validFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
    validUntil: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
    notes: z.string().max(2000).nullish(),
  })
  .refine((v) => Date.parse(v.validUntil) > Date.parse(v.validFrom), {
    message: "la fecha final debe ser posterior a la inicial",
    path: ["validUntil"],
  });

export const updateInvitationStatusBody = z.object({
  status: z.enum(["ENTERED", "EXITED", "CANCELLED"]),
});
