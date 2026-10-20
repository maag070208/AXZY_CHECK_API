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

/** Latitud y longitud opcionales (número o cadena). */
export const optionalLatitude = emptyable(numberish.pipe(latitude));
export const optionalLongitude = emptyable(numberish.pipe(longitude));
