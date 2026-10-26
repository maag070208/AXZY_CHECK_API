import { z } from "zod";

export const pinBody = z.object({
  pin: z.string().regex(/^\d{6}$/, "la clave debe tener 6 dígitos"),
}).strict();
