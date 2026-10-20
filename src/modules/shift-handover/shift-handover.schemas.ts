import { z } from "zod";
import { emptyable, flag, numberish } from "@src/core/validation/common";

const count = emptyable(numberish.pipe(z.number().int().min(0)));

export const createShiftHandoverBody = z.object({
  shiftType: z.enum(["MATUTINO", "NOCTURNO"]),
  handoverDate: z.string().min(1, "es obligatoria"),
  credentialsCount: count,
  tarjetonesCount: count,
  novedades: z.string().max(5000).nullish(),
  checklistPhones: flag.optional(),
  checklistTablet: flag.optional(),
  checklistRadios: flag.optional(),
  checklistKeys: flag.optional(),
  checklistLogbook: flag.optional(),
  checklistConsignas: flag.optional(),
  reportedToAdmin: flag.optional(),
  elements: z.array(z.object({}).passthrough()).nullish(),
});
