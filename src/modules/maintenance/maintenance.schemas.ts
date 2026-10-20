import { z } from "zod";
import { emptyable, positiveId, optionalLatitude, optionalLongitude } from "@src/core/validation/common";

export const createMaintenanceBody = z.object({
  title: z.string().trim().min(1, "es obligatorio").max(200),
  category: z.string().trim().max(120).nullish(),
  description: z.string().max(2000).nullish(),
  media: z.array(z.object({}).passthrough()).nullish(),
  latitude: optionalLatitude,
  longitude: optionalLongitude,
  categoryId: emptyable(positiveId),
  typeId: emptyable(positiveId),
});
