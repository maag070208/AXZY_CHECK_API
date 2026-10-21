import { z } from "zod";

const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "no es una fecha válida");

/** Rango de fechas de los reportes de desempeño; `guardId` opcional (los clientes lo mandan como texto). */
export const guardReportQuery = z.object({
  startDate: date,
  endDate: date,
  guardId: z.string().regex(/^\d+$/, "debe ser un número entero positivo").optional(),
});
