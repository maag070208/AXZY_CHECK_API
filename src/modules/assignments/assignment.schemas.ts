import { z } from "zod";
import { AssignmentStatus } from "@prisma/client";
import { flag, positiveId } from "@src/core/validation/common";

export const createAssignmentBody = z.object({
  guardId: positiveId,
  locationId: positiveId,
  notes: z.string().max(2000).nullish(),
  tasks: z
    .array(z.object({ description: z.string().trim().min(1).max(500), reqPhoto: flag.optional() }).passthrough())
    .nullish(),
});

export const updateAssignmentStatusBody = z.object({
  status: z.enum(Object.values(AssignmentStatus) as [AssignmentStatus, ...AssignmentStatus[]]),
});
