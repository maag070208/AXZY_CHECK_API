import { z } from "zod";
import { flag, positiveId } from "@src/core/validation/common";

export const createUniformCheckBody = z.object({
  guardId: positiveId,
  pantalon: flag.optional(),
  botas: flag.optional(),
  cinturon: flag.optional(),
  camisa: flag.optional(),
  pluma: flag.optional(),
  gorra: flag.optional(),
  unas: flag.optional(),
  orejas: flag.optional(),
  desodorante: flag.optional(),
  afeitado: flag.optional(),
  peinado: flag.optional(),
  notes: z.string().max(2000).nullish(),
});
