import { z } from "zod";
import { emptyable, numberish, positiveId, optionalLatitude, optionalLongitude } from "@src/core/validation/common";

export const createClubBody = z.object({
  title: z.string().trim().min(1, "es obligatorio").max(200),
  categoryId: emptyable(positiveId),
  typeId: emptyable(positiveId),
  description: z.string().max(2000).nullish(),
  media: z.array(z.object({}).passthrough()).nullish(),
  latitude: optionalLatitude,
  longitude: optionalLongitude,
  clientRef: z.string().max(100).nullish(),
  createdAt: z.string().nullish(),
});
