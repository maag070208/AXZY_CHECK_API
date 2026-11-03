import { z } from "zod";

const clientType = z.enum(["RESIDENTIAL", "MAQUILA", "PLAZA"]);

export const createClientBody = z
  .object({
    name: z.string().trim().min(2, "escribe el nombre").max(120),
    type: clientType,
  })
  .strict();

export const updateClientBody = z
  .object({
    name: z.string().trim().min(2, "escribe el nombre").max(120).optional(),
    type: clientType.optional(),
    active: z.boolean().optional(),
  })
  .strict();
