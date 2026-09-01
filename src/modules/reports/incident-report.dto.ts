import { z } from "zod";

const booleanFromString = z
    .string()
    .optional()
    .transform((val) => {
        if (val === undefined) return true;
        return val.toLowerCase() !== "false" && val !== "0";
    });

/**
 * @description Esquema Zod para los query params de generación de PDF de incidencias.
 * Valida que vengan fechas ISO válidas y que `ids` sea un arreglo de enteros positivos.
 * `ids` es opcional: si se omite, se exportan todas las incidencias del rango.
 * `includeImages` y `includeLocation` controlan si esas secciones se imprimen
 * en el PDF (por defecto `true`).
 */
export const incidentPdfQuerySchema = z.object({
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

export type IncidentPdfQuery = z.infer<typeof incidentPdfQuerySchema>["query"];

/**
 * @description Item de evidencia dentro de un incidente para el PDF.
 */
export interface IncidentMediaItem {
    type: "IMAGE" | "VIDEO";
    url: string;
    key?: string;
}

/**
 * @description DTO de salida con la información necesaria para imprimir una
 * incidencia en el PDF.
 */
export interface IncidentReportItem {
    id: number;
    title: string;
    description: string | null;
    status: "PENDING" | "ATTENDED";
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedByName: string | null;
    guardName: string;
    guardUsername: string;
    categoryName: string | null;
    typeName: string | null;
    latitude: number | null;
    longitude: number | null;
    media: IncidentMediaItem[];
}
