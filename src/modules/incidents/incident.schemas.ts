import { z } from "zod";
import { positiveId, latitude, longitude } from "@src/core/validation/common";

export const createIncidentBody = z.object({
  title: z.string().trim().min(1, "es obligatorio").max(200),
  categoryId: positiveId.nullish(),
  typeId: positiveId.nullish(),
  description: z.string().max(2000).nullish(),
  media: z.array(z.object({ type: z.enum(["IMAGE", "VIDEO"]), url: z.string().url() }).passthrough()).nullish(),
  latitude: latitude.nullish(),
  longitude: longitude.nullish(),
});
