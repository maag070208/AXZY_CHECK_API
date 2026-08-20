import { z } from "zod";

/**
 * Items cerrados del checklist de uniforme/aseo.
 * Lista fija en backend para S1; puede migrarse a catálogo dinámico después.
 */
export const UNIFORM_ITEMS = [
    { key: "pantalon", label: "Pantalón" },
    { key: "botas", label: "Botas" },
    { key: "cinturon", label: "Cinturón" },
    { key: "camisa", label: "Camisa" },
    { key: "pluma", label: "Pluma" },
    { key: "gorra", label: "Gorra" },
    { key: "aseo", label: "Aseo (uñas, orejas, desodorante)" },
    { key: "afeitado", label: "Afeitado" },
    { key: "peinado", label: "Peinado" },
] as const;

export type UniformItemKey = (typeof UNIFORM_ITEMS)[number]["key"];

export const UNIFORM_CONTEXTS = ["SHIFT", "ROUND", "SPOT", "OTHER"] as const;
export type UniformContext = (typeof UNIFORM_CONTEXTS)[number];

/**
 * Esquema del checklist de uniforme: cada ítem es { value: boolean, note?: string }.
 */
const uniformItemsSchema = z.record(
    z.string(),
    z.object({
        value: z.boolean(),
        note: z.string().max(500).optional().nullable(),
    }));

/**
 * @description Esquema Zod para crear un UniformCheck.
 * Independiente del cambio de turno: se aplica a cualquier guardia en
 * cualquier momento (contexto SHIFT/ROUND/SPOT/OTHER). Si se capturó durante
 * un ShiftCheck, `shiftCheckId` enlaza el registro (opcional).
 */
export const createUniformCheckSchema = z.object({
    body: z.object({
        userId: z.number().int().positive(),
        items: uniformItemsSchema,
        checkedAt: z.string().datetime().optional(),
        observations: z.string().max(2000).optional().nullable(),
        context: z.enum(UNIFORM_CONTEXTS).optional().default("SHIFT"),
        shiftCheckId: z.string().min(1).optional().nullable(),
        clientRef: z.string().min(1).optional(),
    }),
});

export type CreateUniformCheckInput = z.infer<typeof createUniformCheckSchema>["body"];

/**
 * @description Query params para el datatable/listado.
 */
export const uniformCheckQuerySchema = z.object({
    query: z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        context: z.enum(UNIFORM_CONTEXTS).optional(),
        userId: z.string().optional().transform((v) => (v ? Number(v) : undefined)).refine((v) => v === undefined || (Number.isInteger(v) && v > 0), {
                message: "userId inválido",
            }),
        checkedById: z.string().optional().transform((v) => (v ? Number(v) : undefined)).refine((v) => v === undefined || (Number.isInteger(v) && v > 0), {
                message: "checkedById inválido",
            }),
    }),
});