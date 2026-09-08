import { z } from "zod";

/**
 * @description Esquema Zod para los query params del changelog.
 * `since` es opcional: si no se envía, se usa un default de 30 días atrás
 * para no devolver el historial completo en la primera sincronización
 * (para eso está /sync/bootstrap).
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

export interface CatalogTypeSummary {
  id: number;
  name: string;
  value: string;
  categoryId: number;
  order: number;
}

export interface CatalogCategorySummary {
  id: number;
  name: string;
  value: string;
  color: string | null;
  icon: string | null;
  /** "INCIDENT" | "MAINTENANCE" | "CASA_CLUB" (string libre en el schema). */
  type: string;
  order: number;
  types: CatalogTypeSummary[];
}

export interface TaskSummary {
  id: number;
  description: string;
  reqPhoto: boolean;
}

export interface LocationSummary {
  id: number;
  name: string;
  aisle: string;
  spot: string;
  number: string;
}

export interface RecurringLocationSummary {
  id: number;
  locationId: number;
  location: LocationSummary;
  active: boolean;
  updatedAt: string;
  tasks: TaskSummary[];
}

export interface RouteSummary {
  id: number;
  title: string;
  description: string | null;
  active: boolean;
  updatedAt: string;
  locations: RecurringLocationSummary[];
}

export interface AssignmentSummary {
  id: number;
  locationId: number;
  location: LocationSummary;
  status: string;
  notes: string | null;
  updatedAt: string;
  tasks: TaskSummary[];
}

export interface ActiveRoundSummary {
  id: number;
  clientRef: string | null;
  status: string;
  startTime: string;
  recurringConfigurationId: number | null;
}

/**
 * @description DTO de salida de `GET /sync/bootstrap`: todo lo que la APP
 * necesita para operar sin conexión desde cero (rutas asignadas + sus
 * checkpoints/tareas, asignaciones especiales, catálogos completos y la
 * ronda activa si existe). Se descarga cada vez que hay wifi.
 */
export interface BootstrapResponse {
  serverTime: string;
  routes: RouteSummary[];
  specialAssignments: AssignmentSummary[];
  categories: CatalogCategorySummary[];
  activeRound: ActiveRoundSummary | null;
}

export interface DeltaBlock<T> {
  added: T[];
  modified: T[];
  removed: number[];
}

/**
 * @description DTO de salida de `GET /sync/changelog`: deltas desde `since`
 * para actualizar de forma incremental lo que ya se descargó con
 * /sync/bootstrap (se usa cada vez que hay conexión, no solo la primera vez).
 */
export interface ChangelogResponse {
  serverTime: string;
  routes: DeltaBlock<RouteSummary>;
  specialAssignments: DeltaBlock<AssignmentSummary>;
  categories: DeltaBlock<CatalogCategorySummary>;
}
