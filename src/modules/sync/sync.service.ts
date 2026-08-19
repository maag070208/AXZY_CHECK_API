import { prismaClient } from "@src/core/config/database";
import {
  AssignmentSummary,
  ChangelogResponse,
  DeltaBlock,
  LocationSummary,
  RouteSummary,
  TypeSummary,
} from "./sync.dto";

/** @description Ventana por defecto para la primera sincronización (30 días). */
const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * @description Normaliza el parámetro `since` a un Date. Si no se recibe o es
 * inválido, devuelve un punto en el pasado para no devolver el historial completo.
 * @param since String ISO 8601 opcional.
 * @returns Fecha base para el filtro `updatedAt > since`.
 */
const resolveSinceDate = (since?: string): Date => {
  if (since) {
    const parsed = new Date(since);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - DEFAULT_LOOKBACK_DAYS);
  return fallback;
};

/**
 * @description Mapea una entidad Prisma de RecurringConfiguration a su resumen
 * público para el changelog (selectivo: solo lo que la APP necesita mostrar).
 * @param config Registro crudo de Prisma con `recurringLocations` cargado.
 * @returns DTO `RouteSummary` con conteo de ubicaciones.
 */
const toRouteSummary = (config: {
  id: number;
  title: string;
  description: string | null;
  active: boolean;
  updatedAt: Date;
  recurringLocations?: { id: number }[];
}): RouteSummary => ({
  id: config.id,
  title: config.title,
  description: config.description,
  active: config.active,
  updatedAt: config.updatedAt.toISOString(),
  locationCount: config.recurringLocations?.length ?? 0,
});

/**
 * @description Mapea un RecurringLocation a su resumen público.
 * @param loc Registro de Prisma con `location` cargado.
 * @returns DTO `LocationSummary` con conteo de tareas.
 */
const toLocationSummary = (loc: {
  id: number;
  configurationId: number;
  locationId: number;
  active: boolean;
  updatedAt: Date;
  location: { id: number; name: string };
  tasks?: { id: number }[];
}): LocationSummary => ({
  id: loc.id,
  recurringConfigurationId: loc.configurationId,
  locationId: loc.locationId,
  locationName: loc.location.name,
  active: loc.active,
  updatedAt: loc.updatedAt.toISOString(),
  taskCount: loc.tasks?.length ?? 0,
});

/**
 * @description Mapea un Assignment a su resumen público.
 * @param a Registro de Prisma con `location` cargado.
 * @returns DTO `AssignmentSummary`.
 */
const toAssignmentSummary = (a: {
  id: number;
  locationId: number;
  status: string;
  notes: string | null;
  updatedAt: Date;
  location: { id: number; name: string };
}): AssignmentSummary => ({
  id: a.id,
  locationId: a.locationId,
  locationName: a.location.name,
  status: a.status,
  notes: a.notes,
  updatedAt: a.updatedAt.toISOString(),
});

/**
 * @description Mapea un IncidentType a su resumen, normalizando el `type` de la
 * categoría a `INCIDENT | MAINTENANCE` (en el schema es string libre).
 * @param t Registro de Prisma con `category` cargado.
 * @returns DTO `TypeSummary`.
 */
const toTypeSummary = (t: {
  id: number;
  name: string;
  value: string;
  categoryId: number;
  active: boolean;
  updatedAt: Date;
  category: { id: number; name: string; type: string };
}): TypeSummary => {
  const rawType = t.category.type;
  const categoryType: TypeSummary["categoryType"] =
    rawType === "MAINTENANCE" ? "MAINTENANCE" : "INCIDENT";
  return {
    id: t.id,
    name: t.name,
    value: t.value,
    categoryId: t.categoryId,
    categoryName: t.category.name,
    categoryType,
    active: t.active,
    updatedAt: t.updatedAt.toISOString(),
  };
};

/**
 * @description Construye el bloque de deltas (added/modified) a partir de una
 * lista cruda: separa por `createdAt` vs `updatedAt` relativos a `since`.
 * @param items Lista de entidades con `createdAt` y `updatedAt`.
 * @param since Marca base para discriminar added vs modified.
 * @param mapper Función de proyección a DTO.
 * @returns Bloque con `added` y `modified` poblados y `removed` vacío (la APP
 *          lo calcula por diferencia contra su snapshot).
 */
const buildDelta = <TRaw, TDto>(
  items: Array<TRaw & { createdAt: Date; updatedAt: Date }>,
  since: Date,
  mapper: (item: TRaw) => TDto,
): DeltaBlock<TDto> => {
  const added: TDto[] = [];
  const modified: TDto[] = [];
  for (const item of items) {
    if (item.createdAt > since) {
      added.push(mapper(item));
    } else if (item.updatedAt > since) {
      modified.push(mapper(item));
    }
  }
  return { added, modified, removed: [] };
};

/**
 * @description Devuelve el changelog de cambios relevantes para un guardia
 * desde una marca de tiempo. Solo incluye recursos visibles para el guardia
 * (rutas asignadas, sus ubicaciones y sus asignaciones especiales). Los
 * catálogos de tipos se devuelven completos (son pocos registros).
 * @param guardId Id del guardia autenticado.
 * @param since ISO datetime opcional; default = hace 30 días.
 * @returns Objeto `ChangelogResponse` con deltas y `serverTime` para cursor.
 */
export const getChangelogForGuard = async (
  guardId: number,
  since?: string,
): Promise<ChangelogResponse> => {
  const sinceDate = resolveSinceDate(since);
  const now = new Date();

  // 1. Rutas del guardia modificadas o creadas desde `since`.
  //    Se filtra por la relación `guards` para solo devolver rutas relevantes.
  const routeRecords = await prismaClient.recurringConfiguration.findMany({
    where: {
      active: true,
      guards: { some: { id: guardId } },
      OR: [
        { createdAt: { gt: sinceDate } },
        { updatedAt: { gt: sinceDate } },
      ],
    },
    include: { recurringLocations: { select: { id: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // 2. Ubicaciones de las rutas del guardia modificadas o creadas desde `since`.
  //    Primero se obtienen los ids de rutas del guardia, luego se filtran las
  //    ubicaciones. Esto evita traer ubicaciones de rutas no asignadas.
  const guardRouteIds = routeRecords.map(r => r.id);
  const locationRecords = await prismaClient.recurringLocation.findMany({
    where: {
      configurationId: { in: guardRouteIds },
      OR: [
        { createdAt: { gt: sinceDate } },
        { updatedAt: { gt: sinceDate } },
      ],
    },
    include: {
      location: { select: { id: true, name: true } },
      tasks: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // 3. Asignaciones especiales del guardia modificadas o creadas desde `since`.
  const assignmentRecords = await prismaClient.assignment.findMany({
    where: {
      guardId,
      OR: [
        { createdAt: { gt: sinceDate } },
        { updatedAt: { gt: sinceDate } },
      ],
    },
    include: { location: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // 4. Tipos de catálogo (incidencia + mantenimiento) modificados o creados.
  //    No se filtran por guardia porque son globales, pero el cliente los
  //    filtra localmente por categoría aplicable (INCIDENT/MAINTENANCE).
  const typeRecords = await prismaClient.incidentType.findMany({
    where: {
      OR: [
        { createdAt: { gt: sinceDate } },
        { updatedAt: { gt: sinceDate } },
      ],
    },
    include: { category: { select: { id: true, name: true, type: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const incidentTypes: DeltaBlock<TypeSummary> = {
    added: [],
    modified: [],
    removed: [],
  };
  const maintenanceTypes: DeltaBlock<TypeSummary> = {
    added: [],
    modified: [],
    removed: [],
  };
  for (const t of typeRecords) {
    if (t.category.type === "CASA_CLUB") continue;
    const summary = toTypeSummary(t);
    const target =
      summary.categoryType === "MAINTENANCE" ? maintenanceTypes : incidentTypes;
    if (t.createdAt > sinceDate) target.added.push(summary);
    else if (t.updatedAt > sinceDate) target.modified.push(summary);
  }

  return {
    serverTime: now.toISOString(),
    routes: buildDelta(routeRecords, sinceDate, toRouteSummary),
    locations: buildDelta(locationRecords, sinceDate, toLocationSummary),
    specialAssignments: buildDelta(assignmentRecords, sinceDate, toAssignmentSummary),
    catalogs: {
      incidentTypes,
      maintenanceTypes,
    },
  };
};
