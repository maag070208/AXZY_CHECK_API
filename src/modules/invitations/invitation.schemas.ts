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
    expectedPlate: emptyable(z.string().trim().min(2, "debe tener al menos 2 caracteres").max(12, "no puede pasar de 12 caracteres")),
    /** Solo caseta: visita sin cita. El servidor fija la vigencia y decide si requiere autorización. */
    walkIn: z.boolean().optional(),
  })
  .refine((v) => Date.parse(v.validUntil) > Date.parse(v.validFrom), {
    message: "la fecha final debe ser posterior a la inicial",
    path: ["validUntil"],
  });

export const updateInvitationStatusBody = z.object({
  status: z.enum(["ENTERED", "EXITED", "CANCELLED"]),
  reason: z.string().trim().max(500).optional(),
});

export const approvalBody = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(500, "no puede pasar de 500 caracteres").optional(),
  })
  .refine((v) => v.decision === "APPROVE" || (v.reason ?? "").length >= 3, {
    message: "indica el motivo del rechazo",
    path: ["reason"],
  });

export const visitStatsQuery = z
  .object({
    from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
    to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
    propertyId: positiveId.optional(),
  })
  .refine((v) => Date.parse(v.to) >= Date.parse(v.from), { message: "la fecha final no puede ser anterior a la inicial", path: ["to"] });

export const visitAlertsBody = z.object({ enabled: z.boolean() });
