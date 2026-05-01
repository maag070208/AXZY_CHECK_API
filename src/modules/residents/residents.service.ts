import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export const getResidentsList = async () => {
    return prismaClient.user.findMany({
        where: { softDelete: false, role: { name: 'RESDN' } },
        include: { residentProfile: true, property: true },
        orderBy: { name: 'asc' }
    });
};

export const getDataTableResidents = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const { page, limit, filters } = params;
    const take = Number(limit) || 10;
    const skip = (Math.max(1, Number(page)) - 1) * take;
    const searchTerm = filters?.search || filters?.name || "";
    const propertyId = filters?.propertyId ? Number(filters.propertyId) : null;

    if (searchTerm) {
        const search = `%${searchTerm}%`;
        try {
            await prismaClient.$executeRaw`CREATE EXTENSION IF NOT EXISTS unaccent;`.catch(() => {});

            // Construct parts for dynamic SQL
            const rows: any = propertyId
              ? await prismaClient.$queryRaw`
                SELECT u.*, 
                json_build_object('id', p.id, 'identifier', p.identifier, 'name', p.name) as property,
                (SELECT json_build_object('id', rp.id, 'phoneNumber', rp."phoneNumber", 'email', rp.email, 'emergencyContact', rp."emergencyContact", 'emergencyPhone', rp."emergencyPhone", 'ineFrontUrl', rp."ineFrontUrl", 'ineBackUrl', rp."ineBackUrl") FROM "ResidentProfile" rp WHERE rp."userId" = u.id LIMIT 1) as "residentProfile"
                FROM "User" u
                INNER JOIN "Role" r ON u."roleId" = r.id
                LEFT JOIN "Property" p ON u."propertyId" = p.id
                WHERE u."softDelete" = false
                AND r.name = 'RESDN'
                AND u."propertyId" = ${propertyId}
                AND (
                    unaccent(u."name") ILIKE unaccent(${search}) OR
                    unaccent(COALESCE(u."lastName", '')) ILIKE unaccent(${search}) OR
                    unaccent(u."username") ILIKE unaccent(${search})
                )
                ORDER BY u."id" DESC
                LIMIT ${take} OFFSET ${skip}
              `
              : await prismaClient.$queryRaw`
                SELECT u.*, 
                json_build_object('id', p.id, 'identifier', p.identifier, 'name', p.name) as property,
                (SELECT json_build_object('id', rp.id, 'phoneNumber', rp."phoneNumber", 'email', rp.email, 'emergencyContact', rp."emergencyContact", 'emergencyPhone', rp."emergencyPhone", 'ineFrontUrl', rp."ineFrontUrl", 'ineBackUrl', rp."ineBackUrl") FROM "ResidentProfile" rp WHERE rp."userId" = u.id LIMIT 1) as "residentProfile"
                FROM "User" u
                INNER JOIN "Role" r ON u."roleId" = r.id
                LEFT JOIN "Property" p ON u."propertyId" = p.id
                WHERE u."softDelete" = false
                AND r.name = 'RESDN'
                AND (
                    unaccent(u."name") ILIKE unaccent(${search}) OR
                    unaccent(COALESCE(u."lastName", '')) ILIKE unaccent(${search}) OR
                    unaccent(u."username") ILIKE unaccent(${search})
                )
                ORDER BY u."id" DESC
                LIMIT ${take} OFFSET ${skip}
              `;

            const totalRes: any = propertyId
              ? await prismaClient.$queryRaw`
                SELECT COUNT(*)::int as count 
                FROM "User" u
                INNER JOIN "Role" r ON u."roleId" = r.id
                WHERE u."softDelete" = false
                AND r.name = 'RESDN'
                AND u."propertyId" = ${propertyId}
                AND (
                    unaccent(u."name") ILIKE unaccent(${search}) OR
                    unaccent(COALESCE(u."lastName", '')) ILIKE unaccent(${search}) OR
                    unaccent(u."username") ILIKE unaccent(${search})
                )
              `
              : await prismaClient.$queryRaw`
                SELECT COUNT(*)::int as count 
                FROM "User" u
                INNER JOIN "Role" r ON u."roleId" = r.id
                WHERE u."softDelete" = false
                AND r.name = 'RESDN'
                AND (
                    unaccent(u."name") ILIKE unaccent(${search}) OR
                    unaccent(COALESCE(u."lastName", '')) ILIKE unaccent(${search}) OR
                    unaccent(u."username") ILIKE unaccent(${search})
                )
              `;

            return { rows, total: totalRes[0]?.count || 0 };
        } catch (rawError) {
            console.warn("Fuzzy search failed for residents, falling back to Prisma", rawError);
        }
    }

    const prismaParams = getPrismaPaginationParams(params);
    const whereClause: any = {
        ...prismaParams.where,
        softDelete: false,
        role: { name: 'RESDN' },
    };

    // If we have a searchTerm but raw SQL failed or wasn't used, apply it to Prisma where
    if (searchTerm && !whereClause.OR) {
        whereClause.OR = [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { username: { contains: searchTerm, mode: 'insensitive' } },
        ];
        // Remove 'search' from where if it was added by getPrismaPaginationParams
        delete whereClause.search;
    }

    const [rows, total] = await Promise.all([
        prismaClient.user.findMany({
            ...prismaParams,
            where: whereClause,
            include: { residentProfile: true, property: true },
            orderBy: prismaParams.orderBy || { id: 'desc' }
        }),
        prismaClient.user.count({
            where: whereClause
        })
    ]);

    return { rows, total };
};

export const getResidentById = async (id: number) => {
    return prismaClient.user.findUnique({
        where: { id },
        include: { residentProfile: true, property: true }
    });
};

export const createResidentUser = async (userData: any, profileData: any) => {
    const { propertyId, ...rest } = userData;
    // We use nested writes to create User and ResidentProfile simultaneously
    return prismaClient.user.create({
        data: {
            ...rest,
            role: { connect: { name: 'RESDN' } },
            ...(propertyId ? { property: { connect: { id: Number(propertyId) } } } : {}),
            residentProfile: {
                create: {
                    ...profileData
                }
            }
        },
        include: { residentProfile: true, property: true }
    });
};

export const updateResidentUser = async (id: number, userData: any, profileData: any) => {
    const { propertyId, ...rest } = userData;
    return prismaClient.user.update({
        where: { id },
        data: {
            ...rest,
            ...(propertyId ? { property: { connect: { id: Number(propertyId) } } } : {}),
            residentProfile: {
                upsert: {
                    create: { ...profileData },
                    update: { ...profileData }
                }
            }
        },
        include: { residentProfile: true, property: true }
    });
};

export const deleteResidentUser = async (id: number) => {
    return await prismaClient.user.delete({
        where: { id }
    });
};

export const getRelationshipsList = async () => {
    return await prismaClient.residentRelationship.findMany({
        orderBy: { name: 'asc' }
    });
};
