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

/**
 * Ítems del checklist de entrega de turno.
 */
export const HANDOVER_ITEMS = [
    { key: "caseta", label: "Caseta" },
    { key: "telefonos", label: "Teléfonos" },
    { key: "tablet", label: "Tablet" },
    { key: "radios", label: "Radios" },
    { key: "llaves", label: "Llaves" },
    { key: "bitacora", label: "Bitácora" },
    { key: "consignas", label: "Consignas" },
    { key: "reportedToAdmin", label: "Se reportaron novedades a la administración" },
] as const;

export type HandoverItemKey = (typeof HANDOVER_ITEMS)[number]["key"];

/**
 * Esquema del checklist de uniforme: cada ítem es { value: boolean, note?: string }.
 */
const uniformCheckSchema = z
    .record(
        z.string(),
        z.object({
            value: z.boolean(),
            note: z.string().max(500).optional().nullable(),
        }),
    )
    .optional()
    .nullable();

/**
 * Esquema de entrega de turno: cada ítem es { value: boolean, note?: string }.
 * `reportedToAdmin` se modela igual que los demás.
 */
const handoverItemsSchema = z
    .record(
        z.string(),
        z.object({
            value: z.boolean(),
            note: z.string().max(500).optional().nullable(),
        }),
    )
    .optional()
    .nullable();

/**
 * @description Esquema Zod para crear un ShiftCheck.
 * La firma () se hace en un endpoint separado (`/sign`).
 * replacedById + coverageStart + coverageEnd.
 */
export const createShiftCheckSchema = z.object({
    body: z.object({
        userId: z.number().int().positive(),
        shiftDate: z.string().datetime({ message: "shiftDate debe ser ISO" }),
        shiftType: z.enum(["MATUTINO", "NOCTURNO"]),
        actualEntryAt: z.string().datetime().optional().nullable(),
        isAbsent: z.boolean().optional().default(false),
        uniformCheck: uniformCheckSchema,
        handoverItems: handoverItemsSchema,
        observations: z.string().max(2000).optional().nullable(),
        clientRef: z.string().min(1).optional(),
        replacedById: z.number().int().positive().optional().nullable(),
        coverageStart: z.string().datetime().optional().nullable(),
        coverageEnd: z.string().datetime().optional().nullable(),
    }),
});

export type CreateShiftCheckInput = z.infer<typeof createShiftCheckSchema>["body"];

/**
 * @description Esquema Zod para actualizar un ShiftCheck (antes de firmar).
 */
export const updateShiftCheckSchema = z.object({
    body: z.object({
        actualEntryAt: z.string().datetime().optional().nullable(),
        isAbsent: z.boolean().optional(),
        uniformCheck: uniformCheckSchema,
        handoverItems: handoverItemsSchema,
        observations: z.string().max(2000).optional().nullable(),
    }),
    params: z.object({
        id: z.string().min(1),
    }),
});

/**
 * @description Esquema Zod para firmar (). Reusa credenciales (Opción A).
 */
export const signShiftCheckSchema = z.object({
    body: z.object({
        /**
         * Credenciales del que RECIBE (Opción A del PIN).
         */
        receivedUsername: z.string().min(1),
        receivedPassword: z.string().min(1),
    }),
    params: z.object({
        id: z.string().min(1),
    }),
});

/**
 * @description Query params para el datatable/listado ().
 */
export const shiftCheckQuerySchema = z.object({
    query: z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        shiftType: z.enum(["MATUTINO", "NOCTURNO"]).optional(),
        status: z.enum(["DRAFT", "COMPLETED", "SIGNED"]).optional(),
        userId: z
            .string()
            .optional()
            .transform((v) => (v ? Number(v) : undefined))
            .refine((v) => v === undefined || (Number.isInteger(v) && v > 0), {
                message: "userId inválido",
            }),
        createdById: z
            .string()
            .optional()
            .transform((v) => (v ? Number(v) : undefined))
            .refine((v) => v === undefined || (Number.isInteger(v) && v > 0), {
                message: "createdById inválido",
            }),
    }),
});
