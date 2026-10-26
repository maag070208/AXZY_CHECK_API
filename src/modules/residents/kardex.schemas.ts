import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato YYYY-MM-DD");

export const residentKardexQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  type: z.enum(["ACCESS", "INCIDENT", "FINANCE"]).optional(),
});

export type ResidentKardexQuery = z.output<typeof residentKardexQuery>;
