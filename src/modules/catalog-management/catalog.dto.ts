import { z } from 'zod';

/**
 * Tipos permitidos para una categoría de catálogo.
 * - INCIDENT: asociada a reportes de incidencia.
 * - MAINTENANCE: asociada a reportes de mantenimiento.
 */
export const CATEGORY_TYPES = ['INCIDENT', 'MAINTENANCE'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

/**
 * @description DTO de salida para una categoría del catálogo.
 * El campo `type` se devuelve como string por compatibilidad con la columna libre del schema;
 * los valores válidos en runtime son 'INCIDENT' | 'MAINTENANCE'.
 */
export interface IncidentCategoryDto {
    id: number;
    name: string;
    value: string;
    color: string | null;
    icon: string | null;
    type: string;
    active: boolean;
}

/**
 * @description DTO de salida para un tipo del catálogo.
 */
export interface IncidentTypeDto {
    id: number;
    name: string;
    value: string;
    categoryId: number;
    active: boolean;
}

/**
 * @description Esquema Zod para crear una categoría.
 */
export const createCategorySchema = z.object({
    body: z.object({
        name: z.string().min(1, 'El nombre es requerido').max(100),
        value: z.string().min(1, 'La etiqueta es requerida').max(150),
        color: z.string().regex(/^#([0-9a-fA-F]{3}){1,2}$/, 'Color hexadecimal inválido').optional().nullable(),
        icon: z.string().min(1).max(100).optional().nullable(),
        type: z.enum(CATEGORY_TYPES, { error: 'Tipo inválido. Debe ser INCIDENT o MAINTENANCE' }),
    }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];

/**
 * @description Esquema Zod para actualizar una categoría.
 */
export const updateCategorySchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100).optional(),
        value: z.string().min(1).max(150).optional(),
        color: z.string().regex(/^#([0-9a-fA-F]{3}){1,2}$/, 'Color hexadecimal inválido').optional().nullable(),
        icon: z.string().min(1).max(100).optional().nullable(),
        type: z.enum(CATEGORY_TYPES).optional(),
    }),
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido'),
    }),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];

/**
 * @description Esquema Zod para crear un tipo.
 */
export const createTypeSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'El nombre es requerido').max(100),
        value: z.string().min(1, 'La etiqueta es requerida').max(150),
        categoryId: z.number().int().positive('La categoría es requerida'),
    }),
});

export type CreateTypeInput = z.infer<typeof createTypeSchema>['body'];

/**
 * @description Esquema Zod para actualizar un tipo.
 */
export const updateTypeSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100).optional(),
        value: z.string().min(1).max(150).optional(),
        categoryId: z.number().int().positive().optional(),
    }),
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID inválido'),
    }),
});

export type UpdateTypeInput = z.infer<typeof updateTypeSchema>['body'];
