import { prismaClient } from "@src/core/config/database"; // Consistent with other modules
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { AppError } from "@src/core/errors/app-error";
import { clampLimit, getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

const prisma = prismaClient;

export const getDataTableLocations = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
  try {
    const { page, limit, filters } = params;
    const take = clampLimit(limit);
    const skip = (Math.max(1, Math.trunc(Number(page)) || 1) - 1) * take;
    const searchTerm = filters?.name || "";

    if (searchTerm) {
        const search = `%${searchTerm}%`;
        try {
            const rows: any = await prisma.$queryRaw`
                SELECT * FROM "Location"
                WHERE "softDelete" = false
                AND (
                    unaccent("name") ILIKE unaccent(${search}) OR
                    unaccent("aisle") ILIKE unaccent(${search}) OR
                    unaccent("spot") ILIKE unaccent(${search}) OR
                    unaccent("number") ILIKE unaccent(${search})
                )
                ORDER BY "id" DESC
                LIMIT ${take} OFFSET ${skip}
            `;

            const totalRes: any = await prisma.$queryRaw`
                SELECT COUNT(*)::int as count FROM "Location"
                WHERE "softDelete" = false
                AND (
                    unaccent("name") ILIKE unaccent(${search}) OR
                    unaccent("aisle") ILIKE unaccent(${search}) OR
                    unaccent("spot") ILIKE unaccent(${search}) OR
                    unaccent("number") ILIKE unaccent(${search})
                )
            `;

            return { rows, total: totalRes[0]?.count || 0 };
        } catch (rawError) {
            console.warn("Fuzzy search with unaccent failed, falling back to standard Prisma search", rawError);
        }
    }

    const prismaParams = getPrismaPaginationParams(params);

    const [rows, total] = await Promise.all([
      prisma.location.findMany({
        ...prismaParams,
        where: {
        ...prismaParams.where,
        softDelete: false,
      },
      orderBy: prismaParams.orderBy || { id: 'desc' }
    }),
    prisma.location.count({
      where: {
        ...prismaParams.where,
        softDelete: false,
      }
    })
  ]);

  return { rows, total };
  } catch (error) {
    console.error("Error getting locations:", error);
    return { rows: [], total: 0 };
  }
};

export const getAllLocations = async () => {
  return await prisma.location.findMany({
    where: { softDelete: false },
    orderBy: { id: "desc" },
  });
};

export const createLocation = async (data: {
  aisle: string;
  spot: string;
  number: string;
  name?: string;
}) => {
  const name = data.name || `${data.aisle}-${data.spot}-${data.number}`;
  return await prisma.location.create({
    data: {
      aisle: data.aisle,
      spot: data.spot,
      number: data.number,
      name,
    },
  });
};

export const updateLocation = async (id: number, data: { aisle: string; spot: string; number: string; name: string }) => {
    return await prisma.location.update({
        where: { id },
        data
    });
};

export const deleteLocation = async (id: number) => {
    const location = await prisma.location.findUnique({
        where: { id },
    });

    if (!location) throw new AppError("LOCATION_NOT_FOUND", "Ubicación no encontrada", 404);

    // Con historial (bitácora o asignaciones) no se borra: se perdería la evidencia de las rondas.
    const [scans, assignments] = await Promise.all([
        prisma.kardex.count({ where: { locationId: id } }),
        prisma.assignment.count({ where: { locationId: id } }),
    ]);
    if (scans > 0 || assignments > 0) {
        throw new AppError("LOCATION_IN_USE", "La ubicación tiene registros en la bitácora o asignaciones y no puede eliminarse", 409);
    }

    // 1. Remove from any Recurring configurations
    // First find all recurring locations linked to this location
    // Una sola operación por tabla, no un borrado por punto (E-11).
    await prisma.recurringTask.deleteMany({
        where: { recurringLocation: { locationId: id } }
    });

    // Now delete the recurring locations themselves
    await prisma.recurringLocation.deleteMany({
        where: { locationId: id }
    });

    // 2. Delete the actual location
    return await prisma.location.delete({
        where: { id },
    });
};

export const getAvailableLocation = async () => {
    // Return all active zones (shared logic)
  return await prisma.location.findFirst({
    where: { active: true, softDelete: false },
  });
};
