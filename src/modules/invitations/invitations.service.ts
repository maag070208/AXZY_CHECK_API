import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

function generateCode() {
    return 'AXZ-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const getDataTableInvitations = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);
    const filters = params.filters || {};

    // 1. Overwrite Enum / Exact match fields (must NOT use 'contains')
    if (filters.status) {
        prismaParams.where.status = filters.status;
    }
    if (filters.typeId) {
        prismaParams.where.typeId = Number(filters.typeId);
    }
    if (filters.propertyId) {
        prismaParams.where.propertyId = Number(filters.propertyId);
    }

    // 2. Handle Combined Search
    const searchVal = String(filters.search || filters.code || "").trim();
    if (searchVal.length > 0) {
        // Clean up individual field filters added by utility
        delete prismaParams.where.code;
        delete prismaParams.where.guestName;
        delete prismaParams.where.search;

        prismaParams.where = {
            ...prismaParams.where,
            OR: [
                { code: { contains: String(searchVal), mode: 'insensitive' } },
                { guestName: { contains: String(searchVal), mode: 'insensitive' } }
            ]
        };
    }

    const [rows, total] = await Promise.all([
        prismaClient.invitation.findMany({
            ...prismaParams,
            include: {
                property: { select: { id: true, name: true, identifier: true } },
                createdBy: { select: { id: true, name: true, lastName: true } },
                type: true
            },
            orderBy: prismaParams.orderBy || { id: 'desc' }
        }),
        prismaClient.invitation.count({
            where: prismaParams.where
        })
    ]);

    return { rows, total };
};

export const createInvitation = async (data: { guestName: string, createdById: number, propertyId: number, validFrom: Date, validUntil: Date, notes?: string, typeId: number }) => {
    let uniqueCode = generateCode();
    
    // Ensure uniqueness
    let exists = await prismaClient.invitation.findUnique({ where: { code: uniqueCode } });
    while (exists) {
        uniqueCode = generateCode();
        exists = await prismaClient.invitation.findUnique({ where: { code: uniqueCode } });
    }

    return prismaClient.invitation.create({
        data: {
            ...data,
            code: uniqueCode
        },
        include: {
            property: true,
            type: true,
            createdBy: {
                select: { id: true, name: true, lastName: true }
            }
        }
    });
};

export const getInvitationByIdOrCode = async (identifier: string) => {
    // Try as ID first, fallback to code
    let whereClause: any = { code: identifier };
    if (!isNaN(Number(identifier))) {
        whereClause = { id: Number(identifier) };
    }

    return prismaClient.invitation.findFirst({
        where: whereClause,
        include: {
            property: true,
            createdBy: true
        }
    });
};

export const updateInvitationStatus = async (id: number, status: 'ENTERED' | 'EXITED' | 'CANCELLED') => {
    const data: any = { status };
    if (status === 'ENTERED') data.entryTime = new Date();
    if (status === 'EXITED') data.exitTime = new Date();

    return prismaClient.invitation.update({
        where: { id },
        data
    });
};
