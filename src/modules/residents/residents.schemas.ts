import { z } from "zod";
import { emptyable, emailAddress, optionalPhone10, optionalText, personName, phone10, positiveId } from "@src/core/validation/common";

const text = (max: number) => optionalText(2, max);
const email = emptyable(emailAddress);

const personFields = {
  firstName: text(120),
  fatherLastName: text(120),
  motherLastName: text(120),
  phoneNumber: optionalPhone10,
  email,
  emergencyContact: text(120),
  emergencyPhone: optionalPhone10,
  ineFrontUrl: z.string().url().max(500).nullish(),
  ineBackUrl: z.string().url().max(500).nullish(),
  notes: text(2000),
};

export const addResidentBody = z.object({
  name: personName,
  lastName: text(120),
  username: z.string().trim().min(4, "debe tener al menos 4 caracteres").max(50, "no puede pasar de 50 caracteres").regex(/^[a-zA-Z0-9._-]+$/, "solo letras, números, puntos, guiones y guiones bajos"),
  password: z.string().min(6, "debe tener al menos 6 caracteres").max(100, "no puede pasar de 100 caracteres"),
  propertyId: emptyable(positiveId),
  ...personFields,
});

export const putResidentBody = z.object({
  name: personName.optional(),
  lastName: text(120),
  username: z.string().trim().min(4, "debe tener al menos 4 caracteres").max(50, "no puede pasar de 50 caracteres").regex(/^[a-zA-Z0-9._-]+$/, "solo letras, números, puntos, guiones y guiones bajos").optional(),
  password: z.string().min(6, "debe tener al menos 6 caracteres").max(100, "no puede pasar de 100 caracteres").optional(),
  propertyId: emptyable(positiveId),
  ...personFields,
});

/** Autoservicio del residente: solo sus datos de contacto. Nombre, propiedad y documentos los cambia el personal. */
export const selfProfileBody = z.object({
  phoneNumber: optionalPhone10,
  email: emptyable(emailAddress),
  emergencyContact: optionalText(2, 120),
  emergencyPhone: optionalPhone10,
  photoUrl: z.string().url().max(500).nullish(),
  photoKey: z.string().trim().min(1).max(300).nullish(),
}).strict();

export const contactBody = z.object({
  name: personName,
  phone: optionalPhone10,
  email: emptyable(emailAddress),
  relationship: optionalText(2, 60),
  active: z.boolean().optional(),
  photoUrl: z.string().url().max(500).nullish(),
  photoKey: z.string().trim().min(1).max(300).nullish(),
}).strict();

export const putContactBody = contactBody.partial();
