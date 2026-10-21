import { z } from "zod";
import { emptyable, flag, numberish } from "@src/core/validation/common";

const count = emptyable(numberish.pipe(z.number().int().min(0)));

export const createShiftHandoverBody = z.object({
  shiftType: z.enum(["MATUTINO", "NOCTURNO"]),
  handoverDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe tener formato AAAA-MM-DD").refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida"),
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
