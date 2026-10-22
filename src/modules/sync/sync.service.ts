import { prismaClient } from "@src/core/config/database";
import { getRecurringConfigurationsForUser } from "@src/modules/recurring/recurring.service";
import { getAssignmentsByGuard } from "@src/modules/assignments/assignment.service";

const uniqueLocations = (routes: any[], assignments: any[]) => {
  const map = new Map<number, any>();
  for (const route of routes) {
    for (const item of route.recurringLocations ?? []) {
      if (item.location?.id) map.set(item.location.id, item.location);
    }
  }
  for (const assignment of assignments) {
    if (assignment.location?.id) map.set(assignment.location.id, assignment.location);
  }
  return [...map.values()];
};

/**
 * Snapshot de solo lectura para el guardia/mantenimiento. Es pequeño y está
 * acotado a sus rutas/asignaciones; la APP lo guarda en SQLite para trabajar
 * offline. `since` se acepta para compatibilidad con clientes futuros.
 */
export const getGuardSyncSnapshot = async (userId: number) => {
  const [routes, assignments, activeRound, activeRounds, incidentCategories, incidentTypes, scanTypes] =
    await Promise.all([
      getRecurringConfigurationsForUser(userId),
      getAssignmentsByGuard(userId),
      prismaClient.round.findFirst({
        where: { guardId: userId, status: 'IN_PROGRESS' },
        include: { recurringConfiguration: true },
        orderBy: { startTime: 'desc' },
      }),
      prismaClient.round.findMany({
        where: { status: 'IN_PROGRESS', guardId: { not: userId } },
        select: {
          id: true,
          guardId: true,
          recurringConfigurationId: true,
          startTime: true,
          status: true,
          guard: { select: { id: true, name: true, lastName: true } },
        },
      }),
      prismaClient.incidentCategory.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
      prismaClient.incidentType.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
      prismaClient.scanTypeCatalog.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    ]);

  return {
    cursor: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    routes,
    assignments,
    locations: uniqueLocations(routes, assignments),
    activeRound,
    activeRounds,
    catalogs: {
      incident_category: incidentCategories,
      incident_type: incidentTypes,
      scan_type: scanTypes,
    },
    deleted: [],
  };
};
