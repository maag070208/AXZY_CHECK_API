import { z } from "zod";
import { emptyable, positiveId, optionalLatitude, optionalLongitude } from "@src/core/validation/common";

const media = z.array(z.object({}).passthrough()).nullish();

export const createKardexBody = z.object({
  userId: positiveId,
  locationId: positiveId,
  notes: z.string().max(2000).nullish(),
  media,
  latitude: optionalLatitude,
  longitude: optionalLongitude,
  assignmentId: emptyable(positiveId),
});

export const updateKardexBody = z.object({
  notes: z.string().max(2000).nullish(),
  media,
  latitude: optionalLatitude,
  longitude: optionalLongitude,
});
