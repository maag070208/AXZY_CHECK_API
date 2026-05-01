import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

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
    const take = Number(limit) || 10;
    const skip = (Math.max(1, Number(page)) - 1) * take;
    const searchTerm = filters?.identifier || filters?.name || "";
    const typeId = filters?.typeId ? Number(filters.typeId) : null;

    if (searchTerm) {
        const search = `%${searchTerm}%`;
        try {
            await prismaClient.$executeRaw`CREATE EXTENSION IF NOT EXISTS unaccent;`.catch(() => {});

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
    return prismaClient.property.findUnique({
        where: { id },
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

export const createProperty = async (data: any) => {
    return prismaClient.property.create({
        data: {
            ...data,
            typeId: data.typeId ? Number(data.typeId) : undefined,
            statusId: data.statusId ? Number(data.statusId) : undefined
        }
    });
};

export const updateProperty = async (id: number, data: any) => {
    return prismaClient.property.update({
        where: { id },
        data: {
            ...data,
            typeId: data.typeId ? Number(data.typeId) : undefined,
            statusId: data.statusId ? Number(data.statusId) : undefined
        }
    });
};

export const deleteProperty = async (id: number) => {
    return prismaClient.property.update({
        where: { id },
        data: { softDelete: true, active: false }
    });
};
