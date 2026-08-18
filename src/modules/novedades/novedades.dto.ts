import { z } from "zod";
import { NOVEDADES_MESSAGE_MAX, NOVEDADES_ROLES } from "./novedades.constants";

/**
 * @description Esquema Zod para validar el cuerpo de creación de una novedad.
 * `message` es obligatorio y debe tener entre 1 y {@link NOVEDADES_MESSAGE_MAX} caracteres.
 */
export const createNovedadSchema = z.object({
  body: z.object({
    message: z
      .string()
      .trim()
      .min(1, { message: "El mensaje no puede estar vacío" })
      .max(NOVEDADES_MESSAGE_MAX, {
        message: `El mensaje no puede exceder ${NOVEDADES_MESSAGE_MAX} caracteres`,
      }),
  }),
});

export type CreateNovedadInput = z.infer<typeof createNovedadSchema>["body"];

/**
 * @description Esquema Zod para validar los query params del listado de novedades.
 * Soportan paginación básica.
 */
export const novedadQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export type NovedadQueryInput = z.infer<typeof novedadQuerySchema>["query"];

/**
 * @description Esquema Zod que valida que el rol del usuario autenticado
 * esté autorizado para operar en el módulo de novedades.
 */
export const novedadRoleSchema = z.object({
  role: z.enum(NOVEDADES_ROLES, { message: "Rol no autorizado para novedades" }),
});

/**
 * @description DTO de salida de una novedad lista para consumirse en los
 * clientes (WEB/APP). Incluye los datos del autor para renderizarse sin
 * consultas adicionales.
 */
export interface NovedadResponse {
  id: string;
  userId: number;
  userName: string;
  userRole: string;
  message: string;
  createdAt: string;
}

/**
 * @description Resultado paginado del listado de novedades.
 */
export interface NovedadPage {
  rows: NovedadResponse[];
  total: number;
  page: number;
  limit: number;
}
