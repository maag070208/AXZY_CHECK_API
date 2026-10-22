import { z } from "zod";
import { positiveId, optionalLatitude, optionalLongitude } from "@src/core/validation/common";

export const createIncidentBody = z.object({
  title: z.string().trim().min(1, "es obligatorio").max(200),
  categoryId: positiveId.nullish(),
  typeId: positiveId.nullish(),
  description: z.string().max(2000).nullish(),
  media: z.array(z.object({ type: z.enum(["IMAGE", "VIDEO"]), url: z.string().url() }).passthrough()).nullish(),
  latitude: optionalLatitude,
  longitude: optionalLongitude,
  clientRef: z.string().max(100).nullish(),
  createdAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").nullish(),
}).strict();
