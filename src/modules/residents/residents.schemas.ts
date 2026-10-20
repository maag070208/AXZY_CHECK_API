import { z } from "zod";
import { emptyable, positiveId } from "@src/core/validation/common";

const text = (max: number) => z.string().trim().max(max).nullish();
const email = emptyable(z.string().trim().email("no es un correo válido"));

const personFields = {
  firstName: text(120),
  fatherLastName: text(120),
  motherLastName: text(120),
  phoneNumber: text(30),
  email,
  emergencyContact: text(120),
  emergencyPhone: text(30),
  ineFrontUrl: text(500),
  ineBackUrl: text(500),
  notes: text(2000),
};

export const addResidentBody = z.object({
  name: z.string().trim().min(1, "es obligatorio").max(120),
  lastName: text(120),
  username: z.string().trim().min(1, "es obligatorio").max(50),
  password: z.string().min(6, "debe tener al menos 6 caracteres").max(100),
  propertyId: emptyable(positiveId),
  ...personFields,
});

export const putResidentBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  lastName: text(120),
  username: z.string().trim().min(1).max(50).optional(),
  password: z.string().min(6).max(100).optional(),
  propertyId: emptyable(positiveId),
  ...personFields,
});

export const contactBody = z.object({
  name: z.string().trim().min(1, "es obligatorio").max(120),
  phone: emptyable(z.string().trim().max(30)),
  email,
  relationship: emptyable(z.string().trim().max(60)),
  active: z.boolean().optional(),
});

export const putContactBody = contactBody.partial();
