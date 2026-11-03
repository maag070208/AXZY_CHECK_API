import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

export const createGuardAssignmentBody = z
  .object({
    guardId: positiveId,
    clientId: positiveId,
    startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida").optional(),
  })
  .strict();

export const listGuardAssignmentsQuery = z
  .object({
    clientId: positiveId.optional(),
    guardId: positiveId.optional(),
    active: z.enum(["true", "false"]).optional(),
  })
  .strict();
