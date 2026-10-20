import { z } from "zod";
import { emptyable, flag, positiveId } from "@src/core/validation/common";

const text = (max: number) => z.string().trim().max(max).nullish();

export const addHouseholdResidentBody = z
  .object({
    personId: emptyable(positiveId),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: text(80),
    phone: text(30),
    email: emptyable(z.string().trim().email("no es un correo válido")),
    birthDate: z.string().nullish(),
    kindCode: z.string().trim().min(1).max(40),
    isPrimary: flag.optional(),
    canAuthorizeVisits: flag.optional(),
    hasAppAccess: flag.optional(),
    confirmNewPerson: flag.optional(),
  })
  .refine((v) => Boolean(v.personId) || Boolean(v.firstName), { message: "indica personId o firstName" });

export const moveOutBody = z.object({ replacementPrimaryId: emptyable(positiveId) });
