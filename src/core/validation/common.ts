import { z } from "zod";

/** Id entero positivo. Acepta número o cadena numérica (lo que envían WEB y APP). */
export const positiveId = z
  .union([z.number().int().positive(), z.string().regex(/^\d+$/, "debe ser un número entero positivo")])
  .transform((v) => Number(v));

export const idParam = z.object({ id: positiveId });

/** Coordenadas opcionales. */
export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);
