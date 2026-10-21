import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { clampLimit, getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { resolveKindAndOccupancy, todayDateOnly } from "./occupancy.service";

export const getAllProperties = async () => {
    return prismaClient.property.findMany({
        where: { softDelete: false },
        include: { type: true, status: true },
        orderBy: { id: 'desc' }
    });
};

export const getDataTableProperties = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
  try {
    const { page, limit, filters } = params;
    const take = clampLimit(limit);
    const skip = (Math.max(1, Math.trunc(Number(page)) || 1) - 1) * take;
    const searchTerm = filters?.identifier || filters?.name || "";
    const typeId = filters?.typeId ? Number(filters.typeId) : null;

    if (searchTerm) {
        const search = `%${searchTerm}%`;
        try {

            // Construct parts for dynamic SQL
            const rows: any = typeId 
              ? await prismaClient.$queryRaw`
                SELECT p.*, 
                json_build_object('id', pt.id, 'name', pt.name) as type,
                json_build_object('id', ps.id, 'name', ps.name) as status
                FROM "Property" p
                LEFT JOIN "PropertyType" pt ON p."typeId" = pt.id
                LEFT JOIN "PropertyStatus" ps ON p."statusId" = ps.id
                WHERE p."softDelete" = false
                AND p."typeId" = ${typeId}
                AND (
                    unaccent(p."identifier") ILIKE unaccent(${search}) OR
                    unaccent(p."name") ILIKE unaccent(${search}) OR
                    unaccent(p."mainStreet") ILIKE unaccent(${search})
                )
                ORDER BY p."id" DESC
                LIMIT ${take} OFFSET ${skip}
              `
              : await prismaClient.$queryRaw`
                SELECT p.*, 
                json_build_object('id', pt.id, 'name', pt.name) as type,
                json_build_object('id', ps.id, 'name', ps.name) as status
                FROM "Property" p
                LEFT JOIN "PropertyType" pt ON p."typeId" = pt.id
                LEFT JOIN "PropertyStatus" ps ON p."statusId" = ps.id
                WHERE p."softDelete" = false
                AND (
                    unaccent(p."identifier") ILIKE unaccent(${search}) OR
                    unaccent(p."name") ILIKE unaccent(${search}) OR
                    unaccent(p."mainStreet") ILIKE unaccent(${search})
                )
                ORDER BY p."id" DESC
                LIMIT ${take} OFFSET ${skip}
              `;

            const totalRes: any = typeId
              ? await prismaClient.$queryRaw`
                SELECT COUNT(*)::int as count FROM "Property" p
                WHERE p."softDelete" = false
                AND p."typeId" = ${typeId}
                AND (
                    unaccent(p."identifier") ILIKE unaccent(${search}) OR
                    unaccent(p."name") ILIKE unaccent(${search}) OR
                    unaccent(p."mainStreet") ILIKE unaccent(${search})
                )
              `
              : await prismaClient.$queryRaw`
                SELECT COUNT(*)::int as count FROM "Property" p
                WHERE p."softDelete" = false
                AND (
                    unaccent(p."identifier") ILIKE unaccent(${search}) OR
                    unaccent(p."name") ILIKE unaccent(${search}) OR
                    unaccent(p."mainStreet") ILIKE unaccent(${search})
                )
              `;

            return { rows, total: totalRes[0]?.count || 0 };
        } catch (rawError) {
            console.warn("Fuzzy search with unaccent failed for properties, falling back to standard Prisma search", rawError);
        }
    }

    const prismaParams = getPrismaPaginationParams(params);

    const [rows, total] = await Promise.all([
        prismaClient.property.findMany({
            ...prismaParams,
            where: {
                ...prismaParams.where,
                softDelete: false,
            },
            include: {
                users: {
                   where: { softDelete: false, role: { name: 'RESDN' } },
                   select: { id: true, name: true, lastName: true }
                },
                type: true,
                status: true
            },
            orderBy: prismaParams.orderBy || { id: 'desc' }
        }),
        prismaClient.property.count({
            where: {
                ...prismaParams.where,
                softDelete: false,
            }
        })
    ]);

    return { rows, total };
  } catch (error) {
    console.error("Error getting properties:", error);
    return { rows: [], total: 0 };
  }
};

export const getPropertyById = async (id: number) => {
    return prismaClient.property.findFirst({
        where: { id, softDelete: false },
        include: {
            users: {
                where: { softDelete: false },
                include: { residentProfile: true }
            },
            type: true,
            status: true
        }
    });
};

/** Campos que el cliente puede escribir. La ocupación, el conteo y el propietario NO entran aquí. */
const pickPropertyFields = (data: any) => ({
    identifier: data.identifier,
    name: data.name,
    mainStreet: data.mainStreet,
    betweenStreets: data.betweenStreets ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    active: data.active,
    buildingId: data.buildingId ? Number(data.buildingId) : null,
    floor: data.floor ?? null,
    unitNumber: data.unitNumber ?? null,
    maxResidents: data.maxResidents ?? null,
    vehicleQuota: data.vehicleQuota ?? null,
});

export const createProperty = async (data: any) => {
    return prismaClient.$transaction(async (tx) => {
        const { kindId, occupancyStatusId } = await resolveKindAndOccupancy(tx, {
            kindId: data.kindId ? Number(data.kindId) : undefined,
            occupancyStatusId: data.occupancyStatusId ? Number(data.occupancyStatusId) : undefined,
            typeId: data.typeId ? Number(data.typeId) : undefined,
            statusId: data.statusId ? Number(data.statusId) : undefined,
        });
        const property = await tx.property.create({
            data: {
                ...pickPropertyFields(data),
                typeId: Number(data.typeId),
                statusId: Number(data.statusId),
                kindId,
                occupancyStatusId,
            },
        });
        await tx.occupancyPeriod.create({
            data: { propertyId: property.id, statusId: occupancyStatusId, startDate: await todayDateOnly() },
        });
        return property;
    });
};

/** Códigos legados (PropertyType/PropertyStatus) que la base aún exige, según el tipo y la ocupación. */
const LEGACY_TYPE_FOR_KIND: Record<string, string> = { HOUSE: "CASA", APARTMENT: "DEPA", LOT: "TERRE" };
const LEGACY_STATUS_FOR_OCCUPANCY: Record<string, string> = {
    VACANT: "VACNT",
    OWNER_OCCUPIED: "HABIT",
    RENTED: "HABIT",
    UNDER_CONSTRUCTION: "CONST",
    BLOCKED: "BLOCK",
};

/** Alta desde la importación: usa los catálogos nuevos y llena los legados que la base exige. */
export const createPropertyForImport = async (data: {
    identifier: string;
    name: string;
    mainStreet: string;
    floor: number | null;
    unitNumber: string | null;
    kindId: number;
    occupancyStatusId: number;
}) => {
    return prismaClient.$transaction(async (tx) => {
        const kind = await tx.propertyKind.findUniqueOrThrow({ where: { id: data.kindId } });
        const occupancy = await tx.occupancyStatus.findUniqueOrThrow({ where: { id: data.occupancyStatusId } });
        const legacyType = await tx.propertyType.findUniqueOrThrow({ where: { name: LEGACY_TYPE_FOR_KIND[kind.code] ?? "CASA" } });
        const legacyStatus = await tx.propertyStatus.findUniqueOrThrow({ where: { name: LEGACY_STATUS_FOR_OCCUPANCY[occupancy.code] ?? "VACNT" } });
        const property = await tx.property.create({
            data: {
                identifier: data.identifier,
                name: data.name,
                mainStreet: data.mainStreet,
                floor: data.floor,
                unitNumber: data.unitNumber,
                kindId: data.kindId,
                occupancyStatusId: data.occupancyStatusId,
                typeId: legacyType.id,
                statusId: legacyStatus.id,
            },
        });
        await tx.occupancyPeriod.create({
            data: { propertyId: property.id, statusId: data.occupancyStatusId, startDate: await todayDateOnly() },
        });
        return property;
    });
};

export const updateProperty = async (id: number, data: any) => {
    // El tipo y la ocupación no se cambian aquí: la ocupación tiene su propio endpoint (A1).
    // Solo cambia lo que el cliente envió: un campo ausente no se borra.
    const changes: Record<string, unknown> = {};
    const fields = ["identifier", "name", "mainStreet", "betweenStreets", "latitude", "longitude", "active", "floor", "unitNumber", "maxResidents", "vehicleQuota"] as const;
    for (const field of fields) {
        if (data[field] !== undefined) changes[field] = data[field] === "" ? null : data[field];
    }
    if (data.buildingId !== undefined) changes.buildingId = data.buildingId ? Number(data.buildingId) : null;
    return prismaClient.property.update({ where: { id }, data: changes });
};

export const deleteProperty = async (id: number) => {
    return prismaClient.property.update({
        where: { id },
        data: { softDelete: true, active: false }
    });
};
