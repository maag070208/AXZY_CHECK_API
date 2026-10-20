import { z } from "zod";
import { flag } from "@src/core/validation/common";

const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "debe tener formato HH:mm");

export const createScheduleBody = z.object({
  name: z.string().trim().min(1, "es obligatorio").max(60),
  startTime: hhmm,
  endTime: hhmm,
});

export const updateScheduleBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  active: flag.optional(),
});
