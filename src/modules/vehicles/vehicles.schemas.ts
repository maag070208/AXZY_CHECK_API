import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

export const vehicleBody = z
  .object({
    plate: z.string().trim().min(2, "escribe la placa").max(20),
    kind: z.string().trim().max(30).optional(),
    brand: z.string().trim().max(40).optional(),
    model: z.string().trim().max(40).optional(),
    color: z.string().trim().max(30).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();

export const vehicleQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "INACTIVE"]).optional(),
  search: z.string().trim().max(40).optional(),
});

export const vehicleLookupQuery = z.object({
  q: z.string().trim().min(2, "escribe una placa o tag").max(40),
});

export const accessBody = z.object({
  direction: z.enum(["ENTRY", "EXIT"]),
});

export const approveBody = z.object({
  tagCode: z.string().trim().min(3).max(20).optional(),
});

export const rejectBody = z.object({
  notes: z.string().trim().max(300).optional(),
});

export const vehicleIdParam = z.object({ id: positiveId });
