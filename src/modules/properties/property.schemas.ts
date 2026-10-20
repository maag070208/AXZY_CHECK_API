import { z } from "zod";
import { emptyable, flag, positiveId, optionalLatitude, optionalLongitude } from "@src/core/validation/common";

const createFields = {
  identifier: z.string().trim().min(1, "es obligatorio").max(40),
  name: z.string().trim().min(1, "es obligatorio").max(120),
  mainStreet: z.string().trim().min(1, "es obligatoria").max(200),
  betweenStreets: z.string().trim().max(200).nullish(),
  latitude: optionalLatitude,
  longitude: optionalLongitude,
  typeId: positiveId,
  statusId: positiveId,
  active: flag.optional(),
};

export const createPropertyBody = z.object(createFields);
export const updatePropertyBody = z.object({
  ...createFields,
  typeId: emptyable(positiveId),
  statusId: emptyable(positiveId),
}).partial();
