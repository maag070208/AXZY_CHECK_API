import { z } from "zod";
import { emptyable, personName, positiveId } from "@src/core/validation/common";

export const createInvitationBody = z
  .object({
    guestName: personName,
    propertyId: positiveId,
    typeId: positiveId,
    validFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
    validUntil: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
    notes: emptyable(z.string().trim().min(2, "debe tener al menos 2 caracteres").max(2000, "no puede pasar de 2000 caracteres")),
  })
  .refine((v) => Date.parse(v.validUntil) > Date.parse(v.validFrom), {
    message: "la fecha final debe ser posterior a la inicial",
    path: ["validUntil"],
  });

export const updateInvitationStatusBody = z.object({
  status: z.enum(["ENTERED", "EXITED", "CANCELLED"]),
  reason: z.string().trim().max(500).optional(),
});
