import { prismaClient } from "@src/core/config/database";

/**
 * @description The three independent catalogs the app manages through the
 * shared `IncidentCategory`/`IncidentType` tables, distinguished by
 * `IncidentCategory.type`.
 */
export const CATALOG_TYPES = ["INCIDENT", "MAINTENANCE", "CASA_CLUB"] as const;
export type CatalogAdminType = (typeof CATALOG_TYPES)[number];

/**
 * @description Lists categories for a catalog (all, including inactive ones,
 * for the admin screen), with a count of how many types each one has.
 * @param type Optional filter — one of `CATALOG_TYPES`.
 */
export const getCategories = async (type?: string) => {
  return prismaClient.incidentCategory.findMany({
    where: type ? { type } : undefined,
    select: {
      id: true,
      name: true,
      value: true,
      color: true,
      icon: true,
      type: true,
      active: true,
      order: true,
      _count: { select: { types: true } },
    },
    orderBy: [{ order: "asc" }, { value: "asc" }],
  });
};

/**
 * @description Creates a new incident/maintenance/casa-club category,
 * appending it at the end of its catalog's current order.
 */
export const createCategory = async (data: {
  name: string;
  value: string;
  type: CatalogAdminType;
  color?: string;
  icon?: string;
}) => {
  const maxOrder = await prismaClient.incidentCategory.aggregate({
    where: { type: data.type },
    _max: { order: true },
  });

  return prismaClient.incidentCategory.create({
    data: {
      name: data.name,
      value: data.value,
      type: data.type,
      color: data.color,
      icon: data.icon,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
};

/**
 * @description Updates a category's editable fields (name/value/color/icon/active).
 */
export const updateCategory = async (
  id: number,
  data: Partial<{ name: string; value: string; color: string; icon: string; active: boolean }>,
) => {
  return prismaClient.incidentCategory.update({ where: { id }, data });
};

/**
 * @description Deletes a category. If it has historical incidents/maintenance
 * records or still has types under it, it's soft-disabled (`active:false`)
 * instead, to protect referential integrity and historical reports.
 */
export const deleteCategory = async (id: number) => {
  const [incidentCount, maintenanceCount, typeCount] = await Promise.all([
    prismaClient.incident.count({ where: { categoryId: id } }),
    prismaClient.maintenance.count({ where: { categoryId: id } }),
    prismaClient.incidentType.count({ where: { categoryId: id } }),
  ]);

  const inUse = incidentCount > 0 || maintenanceCount > 0 || typeCount > 0;
  if (inUse) {
    await prismaClient.incidentCategory.update({ where: { id }, data: { active: false } });
    return { softDeleted: true };
  }

  await prismaClient.incidentCategory.delete({ where: { id } });
  return { softDeleted: false };
};

/**
 * @description Reassigns `order` for a set of categories according to the
 * position of each id in the given array (drag/arrow reordering from WEB).
 */
export const reorderCategories = async (ids: number[]) => {
  await prismaClient.$transaction(
    ids.map((id, index) =>
      prismaClient.incidentCategory.update({ where: { id }, data: { order: index } }),
    ),
  );
};

/**
 * @description "Fijar como acceso rápido": pins a category to the very start
 * of its catalog by giving it an order lower than everything else.
 */
export const pinCategory = async (id: number) => {
  return prismaClient.incidentCategory.update({ where: { id }, data: { order: -1 } });
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @description Lists incident types for a category (all, including inactive
 * ones, for the admin screen).
 */
export const getTypes = async (categoryId?: number) => {
  return prismaClient.incidentType.findMany({
    where: categoryId ? { categoryId } : undefined,
    select: { id: true, name: true, value: true, categoryId: true, active: true, order: true },
    orderBy: [{ order: "asc" }, { value: "asc" }],
  });
};

/**
 * @description Creates a new type under a category, appending it at the end
 * of that category's current order.
 */
export const createType = async (data: { name: string; value: string; categoryId: number }) => {
  const maxOrder = await prismaClient.incidentType.aggregate({
    where: { categoryId: data.categoryId },
    _max: { order: true },
  });

  return prismaClient.incidentType.create({
    data: { ...data, order: (maxOrder._max.order ?? -1) + 1 },
  });
};

/**
 * @description Updates a type's editable fields (name/value/categoryId/active).
 */
export const updateType = async (
  id: number,
  data: Partial<{ name: string; value: string; categoryId: number; active: boolean }>,
) => {
  return prismaClient.incidentType.update({ where: { id }, data });
};

/**
 * @description Deletes a type. If it has historical incidents/maintenance
 * records, it's soft-disabled (`active:false`) instead.
 */
export const deleteType = async (id: number) => {
  const [incidentCount, maintenanceCount] = await Promise.all([
    prismaClient.incident.count({ where: { typeId: id } }),
    prismaClient.maintenance.count({ where: { typeId: id } }),
  ]);

  const inUse = incidentCount > 0 || maintenanceCount > 0;
  if (inUse) {
    await prismaClient.incidentType.update({ where: { id }, data: { active: false } });
    return { softDeleted: true };
  }

  await prismaClient.incidentType.delete({ where: { id } });
  return { softDeleted: false };
};

/**
 * @description Reassigns `order` for a set of types (within the same
 * category) according to the position of each id in the given array.
 */
export const reorderTypes = async (ids: number[]) => {
  await prismaClient.$transaction(
    ids.map((id, index) => prismaClient.incidentType.update({ where: { id }, data: { order: index } })),
  );
};

/**
 * @description "Fijar como acceso rápido": pins a type to the very start of
 * its category's type list.
 */
export const pinType = async (id: number) => {
  return prismaClient.incidentType.update({ where: { id }, data: { order: -1 } });
};
