import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

export const loginBody = z.object({
  username: z.string().trim().min(1, "es obligatorio"),
  password: z.string().min(1, "es obligatoria"),
});

export const createUserBody = z
  .object({
    name: z.string().trim().min(1, "es obligatorio").max(100),
    lastName: z.string().trim().max(100).nullish(),
    username: z.string().trim().min(3, "debe tener al menos 3 caracteres").max(50),
    password: z.string().min(6, "debe tener al menos 6 caracteres").max(100),
    roleId: positiveId.optional(),
    role: z.string().trim().min(1).optional(),
    scheduleId: positiveId.nullish(),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/, "formato HH:mm").nullish(),
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/, "formato HH:mm").nullish(),
  })
  .refine((v) => v.roleId !== undefined || v.role !== undefined, {
    message: "indica el rol (roleId o role)",
    path: ["roleId"],
  });

export const updateUserBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().max(100).nullish(),
    username: z.string().trim().min(3).max(50).optional(),
    roleId: positiveId.optional(),
    role: z.string().trim().min(1).optional(),
    scheduleId: positiveId.nullish(),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    password: z.string().optional(),
  })
  .passthrough();
