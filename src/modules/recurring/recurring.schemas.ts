import { z } from "zod";
import { positiveId, idParam } from "@src/core/validation/common";

const task = z.object({
  description: z.string().trim().min(1, "es obligatoria").max(300),
  reqPhoto: z.boolean().optional().default(false),
});

const location = z.object({
  locationId: positiveId,
  tasks: z.array(task).optional().default([]),
});

export const routeBody = z.object({
  title: z.string().trim().min(1, "es obligatorio").max(150),
  locations: z.array(location).min(1, "debe tener al menos un punto"),
  guardIds: z.array(positiveId).optional(),
});

export const routeParams = idParam;
