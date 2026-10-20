import { z } from "zod";

const part = z.string().trim().min(1).max(40);

// Dos formas válidas: solo nombre (legado) o aisle/spot/number.
export const addLocationBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    aisle: part.optional(),
    spot: part.optional(),
    number: part.optional(),
  })
  .refine((v) => Boolean(v.name) || (Boolean(v.aisle) && Boolean(v.spot) && Boolean(v.number)), {
    message: "indica un nombre o pasillo, lugar y número",
  });

export const putLocationBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  aisle: part.optional(),
  spot: part.optional(),
  number: part.optional(),
});
