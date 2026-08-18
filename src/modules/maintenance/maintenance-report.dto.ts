import { z } from "zod";

const booleanFromString = z
    .string()
    .optional()
    .transform((val) => {
        if (val === undefined) return true;
        return val.toLowerCase() !== "false" && val !== "0";
    });

/**
 * @description Esquema Zod para los query params de generación de PDF de mantenimientos.
 * Acepta fechas ISO, lista de IDs opcional y flags de contenido.
 */
export const maintenancePdfQuerySchema = z.object({
    query: z.object({
        startDate: z.string().datetime({ message: "startDate debe ser una fecha ISO válida" }),
        endDate: z.string().datetime({ message: "endDate debe ser una fecha ISO válida" }),
        ids: z
            .string()
            .optional()
            .transform((val) => {
                if (!val) return [] as number[];
                return val
                    .split(",")
                    .map((v) => Number(v.trim()))
                    .filter((n) => Number.isInteger(n) && n > 0);
            }),
        includeImages: booleanFromString,
        includeLocation: booleanFromString,
    }),
});

export type MaintenancePdfQuery = z.infer<typeof maintenancePdfQuerySchema>["query"];
