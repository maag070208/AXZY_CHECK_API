import { z } from "zod";

export const pinBody = z.object({
  pin: z.string().regex(/^\d{6}$/, "la clave debe tener 6 dígitos"),
}).strict();

export const createPinBody = z
  .object({
    pin: z.string().regex(/^\d{6}$/, "la clave debe tener 6 dígitos").optional(),
  })
  .strict()
  .default({});

export const qrTokenBody = z.object({
  token: z.string().trim().min(8).max(2000),
}).strict();
