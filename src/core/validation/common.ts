import { z } from "zod";

/** Id entero positivo. Acepta número o cadena numérica (lo que envían WEB y APP). */
export const positiveId = z
  .union([z.number().int().positive(), z.string().regex(/^\d+$/, "debe ser un número entero positivo")])
  .transform((v) => Number(v));

export const idParam = z.object({ id: positiveId });

/** Coordenadas opcionales. */
export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/** Número o cadena numérica (WEB y APP envían ambos). */
export const numberish = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/, "debe ser un número")])
  .transform(Number);

/** Bandera que el cliente puede mandar como true/false, 1/0 o "true"/"false"/"1"/"0". */
export const flag = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal("0"), z.literal("1"), z.literal("true"), z.literal("false")])
  .transform((v) => v === true || v === 1 || v === "1" || v === "true");

/** Campo opcional que el cliente puede omitir, mandar vacío o null para "sin valor". */
export const emptyable = <T extends z.ZodType>(schema: T) => z.union([schema, z.literal(""), z.null()]).optional();

/** Latitud y longitud opcionales (número o cadena). Vacío ("") equivale a "sin valor" (null). */
const optionalCoordinate = (schema: typeof latitude) =>
  z.union([numberish.pipe(schema), z.literal("").transform(() => null), z.null()]).optional();
export const optionalLatitude = optionalCoordinate(latitude);

/** Teléfono de 10 dígitos exactos (MX). Sin espacios ni guiones: la APP limpia el campo. */
export const phone10 = z.string().trim().regex(/^\d{10}$/, "debe tener exactamente 10 dígitos");
/** Teléfono opcional: vacío o null significa "sin teléfono"; si viene, debe ser de 10 dígitos. */
export const optionalPhone10 = z.union([phone10, z.literal("").transform(() => null), z.null()]).optional();

/** Nombre de persona: 2 a 120 caracteres, solo letras, espacios, apóstrofes, guiones y puntos. */
export const personName = z
  .string()
  .trim()
  .min(2, "debe tener al menos 2 caracteres")
  .max(120, "no puede pasar de 120 caracteres")
  .regex(/^[\p{L}][\p{L}\s.'-]*$/u, "solo puede tener letras, espacios, apóstrofes, guiones y puntos");

/** Correo: 6 a 120 caracteres con formato de correo. */
export const emailAddress = z
  .string()
  .trim()
  .min(6, "debe tener al menos 6 caracteres")
  .max(120, "no puede pasar de 120 caracteres")
  .email("no es un correo válido");

/** Texto libre opcional con mínimo y máximo. Vacío o null significa "sin valor". */
export const optionalText = (min: number, max: number) =>
  z.union([z.string().trim().min(min, `debe tener al menos ${min} caracteres`).max(max, `no puede pasar de ${max} caracteres`), z.literal("").transform(() => null), z.null()]).optional();
export const optionalLongitude = optionalCoordinate(longitude);
