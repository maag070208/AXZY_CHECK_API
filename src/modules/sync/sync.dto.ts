import { z } from "zod";

/**
 * @description Esquema Zod para los query params del changelog.
 * `since` es opcional: si no se envía, se usa un default de 30 días atrás
 * para no devolver el historial completo en la primera sincronización.
 */
export const changelogQuerySchema = z.object({
  query: z.object({
    since: z
      .string()
      .datetime({ message: "Fecha 'since' inválida (se esperaba ISO 8601)" })
      .optional(),
  }),
});

export type ChangelogQueryInput = z.infer<typeof changelogQuerySchema>["query"];

/**
 * @description Resumen de una ruta para incluir en el changelog.
 * Solo expone los campos que la APP necesita para mostrar la notificación
 * y para refrescar la caché local de rutas.
 */
export interface RouteSummary {
  id: number;
  title: string;
  description: string | null;
  active: boolean;
  updatedAt: string;
  locationCount: number;
}

/**
 * @description Resumen de una ubicación (punto de control) de una ruta.
 */
export interface LocationSummary {
  id: number;
  recurringConfigurationId: number;
  locationId: number;
  locationName: string;
  active: boolean;
  updatedAt: string;
  taskCount: number;
}

/**
 * @description Resumen de una asignación especial (puntual) para el guardia.
 */
export interface AssignmentSummary {
  id: number;
  locationId: number;
  locationName: string;
  status: string;
  notes: string | null;
  updatedAt: string;
}

/**
 * @description Resumen de un tipo de catálogo (incidencia/mantenimiento).
 */
export interface TypeSummary {
  id: number;
  name: string;
  value: string;
  categoryId: number;
  categoryName: string;
  categoryType: "INCIDENT" | "MAINTENANCE";
  active: boolean;
  updatedAt: string;
}

/**
 * @description Bloque genérico de deltas (agregados / modificados / eliminados).
 * `removed` siempre contiene los ids que ya no están visibles para el guardia.
 */
export interface DeltaBlock<T> {
  added: T[];
  modified: T[];
  removed: number[];
}

/**
 * @description DTO de salida del endpoint `GET /api/v1/sync/changelog`.
 * Devuelve, para el guardia autenticado, todos los cambios registrados en
 * el servidor desde la marca de tiempo `since`. El cliente usa `serverTime`
 * para actualizar su cursor y volver a llamar con `since = serverTime`.
 */
export interface ChangelogResponse {
  serverTime: string;
  routes: DeltaBlock<RouteSummary>;
  locations: DeltaBlock<LocationSummary>;
  specialAssignments: DeltaBlock<AssignmentSummary>;
  catalogs: {
    incidentTypes: DeltaBlock<TypeSummary>;
    maintenanceTypes: DeltaBlock<TypeSummary>;
  };
}
