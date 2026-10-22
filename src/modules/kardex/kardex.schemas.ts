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
  roundId: emptyable(positiveId),
  clientRef: z.string().max(100).nullish(),
  scannedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").nullish(),
}).strict();

export const updateKardexBody = z.object({
  notes: z.string().max(2000).nullish(),
  media,
  latitude: optionalLatitude,
  longitude: optionalLongitude,
});
