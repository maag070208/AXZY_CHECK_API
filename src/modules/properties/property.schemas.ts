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
  // Datos de unidad que el servicio ya sabe guardar (A1); sin declararlos aquí Zod los descartaba en silencio.
  buildingId: emptyable(positiveId),
  floor: z.number().int().min(0).max(200).nullish(),
  unitNumber: z.string().trim().max(20).nullish(),
  maxResidents: z.number().int().min(1).max(100).nullish(),
  vehicleQuota: z.number().int().min(0).max(50).nullish(),
};

export const createPropertyBody = z.object(createFields);
export const updatePropertyBody = z.object({
  ...createFields,
  typeId: emptyable(positiveId),
  statusId: emptyable(positiveId),
}).partial();
