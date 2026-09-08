import { prismaClient } from "@src/core/config/database";
import {
  ActiveRoundSummary,
  AssignmentSummary,
  BootstrapResponse,
  CatalogCategorySummary,
  ChangelogResponse,
  DeltaBlock,
  LocationSummary,
  RouteSummary,
  TaskSummary,
} from "./sync.dto";

/** @description Ventana por defecto para /sync/changelog si no se manda `since`. */
const DEFAULT_LOOKBACK_DAYS = 30;

const resolveSinceDate = (since?: string): Date => {
  if (since) {
    const parsed = new Date(since);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - DEFAULT_LOOKBACK_DAYS);
  return fallback;
};

const toLocationSummary = (loc: {
  id: number;
  name: string;
  aisle: string;
  spot: string;
  number: string;
}): LocationSummary => ({
  id: loc.id,
  name: loc.name,
  aisle: loc.aisle,
  spot: loc.spot,
  number: loc.number,
});

const toTaskSummary = (t: { id: number; description: string; reqPhoto: boolean }): TaskSummary => ({
  id: t.id,
  description: t.description,
  reqPhoto: t.reqPhoto,
});

const toRouteSummary = (config: {
  id: number;
  title: string;
  description: string | null;
  active: boolean;
  updatedAt: Date;
  recurringLocations: Array<{
    id: number;
    locationId: number;
    active: boolean;
    updatedAt: Date;
    location: { id: number; name: string; aisle: string; spot: string; number: string };
    tasks: Array<{ id: number; description: string; reqPhoto: boolean }>;
  }>;
}): RouteSummary => ({
  id: config.id,
  title: config.title,
  description: config.description,
  active: config.active,
  updatedAt: config.updatedAt.toISOString(),
  locations: config.recurringLocations.map(loc => ({
    id: loc.id,
    locationId: loc.locationId,
    location: toLocationSummary(loc.location),
    active: loc.active,
    updatedAt: loc.updatedAt.toISOString(),
    tasks: loc.tasks.map(toTaskSummary),
  })),
});

const toAssignmentSummary = (a: {
  id: number;
  locationId: number;
  status: string;
  notes: string | null;
  updatedAt: Date;
  location: { id: number; name: string; aisle: string; spot: string; number: string };
  tasks: Array<{ id: number; description: string; reqPhoto: boolean }>;
}): AssignmentSummary => ({
  id: a.id,
  locationId: a.locationId,
  location: toLocationSummary(a.location),
  status: a.status,
  notes: a.notes,
  updatedAt: a.updatedAt.toISOString(),
  tasks: a.tasks.map(toTaskSummary),
});

const toCategorySummary = (cat: {
  id: number;
  name: string;
  value: string;
  color: string | null;
  icon: string | null;
  type: string;
  order: number;
  updatedAt: Date;
  types: Array<{ id: number; name: string; value: string; categoryId: number; order: number }>;
}): CatalogCategorySummary => ({
  id: cat.id,
  name: cat.name,
  value: cat.value,
  color: cat.color,
  icon: cat.icon,
  type: cat.type,
  order: cat.order,
  types: cat.types.map(t => ({ id: t.id, name: t.name, value: t.value, categoryId: t.categoryId, order: t.order })),
});

const routeInclude = {
  recurringLocations: {
    where: { active: true },
    include: {
      location: { select: { id: true, name: true, aisle: true, spot: true, number: true } },
      tasks: true,
    },
  },
};

const assignmentInclude = {
  location: { select: { id: true, name: true, aisle: true, spot: true, number: true } },
  tasks: true,
};

const categoryInclude = {
  types: {
    where: { active: true },
    orderBy: [{ order: "asc" as const }, { value: "asc" as const }],
  },
};

/**
 * @description Todo lo que un guardia necesita para operar los 4 flujos
 * (Ronda/Incidencia/Mantenimiento/Casa Club) sin conexión: sus rutas con
 * checkpoints y tareas, asignaciones especiales vigentes, el catálogo
 * completo de categorías/tipos, y su ronda activa (si tiene una). La APP
 * la descarga cada vez que detecta wifi para tener siempre una copia
 * reciente lista para cuando se quede sin señal.
 */
export const getBootstrapForGuard = async (guardId: number): Promise<BootstrapResponse> => {
  const now = new Date();

  const [routes, assignments, categories, activeRound] = await Promise.all([
    prismaClient.recurringConfiguration.findMany({
      where: { active: true, guards: { some: { id: guardId } } },
      include: routeInclude,
      orderBy: { updatedAt: "desc" },
    }),
    prismaClient.assignment.findMany({
      where: { guardId, status: { in: ["PENDING", "CHECKING", "UNDER_REVIEW", "ANOMALY"] } },
      include: assignmentInclude,
      orderBy: { updatedAt: "desc" },
    }),
    prismaClient.incidentCategory.findMany({
      where: { active: true },
      include: categoryInclude,
      orderBy: [{ order: "asc" }, { value: "asc" }],
    }),
    prismaClient.round.findFirst({
      where: { guardId, status: "IN_PROGRESS" },
      orderBy: { startTime: "desc" },
    }),
  ]);

  // `clientRef` no existe aún en el cliente Prisma generado en este sandbox
  // (ver nota más abajo); en runtime sí existe tras aplicar la migración.
  const activeRoundAny = activeRound as any;
  const activeRoundSummary: ActiveRoundSummary | null = activeRound
    ? {
        id: activeRoundAny.id,
        clientRef: activeRoundAny.clientRef ?? null,
        status: activeRoundAny.status,
        startTime: activeRoundAny.startTime.toISOString(),
        recurringConfigurationId: activeRoundAny.recurringConfigurationId,
      }
    : null;

  return {
    serverTime: now.toISOString(),
    // NOTA: el cliente Prisma local de este sandbox está desactualizado
    // (no hay red para correr `prisma generate` aquí) y su inferencia de
    // tipos para este `include` anidado no resuelve bien pese a que la
    // consulta es válida en runtime; se relaja el tipo del callback para
    // no bloquear la compilación. Re-verificar con `tsc --noEmit` después
    // de correr `prisma generate` con el schema actualizado.
    routes: routes.map(toRouteSummary as any),
    specialAssignments: assignments.map(toAssignmentSummary as any),
    categories: categories.map(toCategorySummary as any),
    activeRound: activeRoundSummary,
  };
};

const buildDelta = <TRaw extends { createdAt: Date; updatedAt: Date }, TDto>(
  items: TRaw[],
  since: Date,
  mapper: (item: TRaw) => TDto,
): DeltaBlock<TDto> => {
  const added: TDto[] = [];
  const modified: TDto[] = [];
  for (const item of items) {
    if (item.createdAt > since) added.push(mapper(item));
    else if (item.updatedAt > since) modified.push(mapper(item));
  }
  return { added, modified, removed: [] };
};

/**
 * @description Deltas (agregado/modificado) desde `since` para lo que ya se
 * descargó con /sync/bootstrap. `removed` queda vacío a propósito (no hay
 * borrado físico de rutas/catálogos en este sistema, solo `active:false`,
 * que ya se refleja como "modified" con active=false).
 */
export const getChangelogForGuard = async (guardId: number, since?: string): Promise<ChangelogResponse> => {
  const sinceDate = resolveSinceDate(since);
  const now = new Date();

  const [routes, assignments, categories] = await Promise.all([
    prismaClient.recurringConfiguration.findMany({
      where: {
        guards: { some: { id: guardId } },
        OR: [{ createdAt: { gt: sinceDate } }, { updatedAt: { gt: sinceDate } }],
      },
      include: routeInclude,
      orderBy: { updatedAt: "desc" },
    }),
    prismaClient.assignment.findMany({
      where: {
        guardId,
        OR: [{ createdAt: { gt: sinceDate } }, { updatedAt: { gt: sinceDate } }],
      },
      include: assignmentInclude,
      orderBy: { updatedAt: "desc" },
    }),
    prismaClient.incidentCategory.findMany({
      where: {
        OR: [{ createdAt: { gt: sinceDate } }, { updatedAt: { gt: sinceDate } }],
      },
      include: categoryInclude,
      orderBy: [{ order: "asc" }, { value: "asc" }],
    }),
  ]);

  return {
    serverTime: now.toISOString(),
    // Ver nota en getBootstrapForGuard sobre el cast `as any`.
    routes: buildDelta(routes as any, sinceDate, toRouteSummary as any),
    specialAssignments: buildDelta(assignments as any, sinceDate, toAssignmentSummary as any),
    categories: buildDelta(categories as any, sinceDate, toCategorySummary as any),
  };
};
