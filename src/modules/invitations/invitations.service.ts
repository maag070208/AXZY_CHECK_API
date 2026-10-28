import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, INVITATION_TRANSITIONS } from "@src/core/transitions/transitions";
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { AccessDecision, AccessDirection, AccessMethod, ResidentStatus } from "@prisma/client";
import { getPropertyAccessStatus, recordAccessEvent } from "../access-control/access-control.service";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { residentOwnsProperty as residentOwnsPropertyShared } from "../residents/resident-property.service";

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

/**
 * ¿La residente vive en esa propiedad? (solo invita a la suya). Vale el vínculo canónico Person → Resident
 * activo, igual que quejas y cargos; `User.propertyId` se acepta por las cuentas anteriores a ese vínculo.
 */
export const residentOwnsProperty = (userId: number, propertyId: number) => residentOwnsPropertyShared(userId, propertyId);

/** Quién creó la invitación, o null si no existe. */
export const getInvitationOwner = async (id: number): Promise<number | null> => {
    const row = await prismaClient.invitation.findUnique({ where: { id }, select: { createdById: true } });
    return row?.createdById ?? null;
};

export const createInvitation = async (data: { guestName: string, createdById: number, propertyId: number, validFrom: Date, validUntil: Date, notes?: string, typeId: number }) => {
    const property = await prismaClient.property.findFirst({ where: { id: data.propertyId, softDelete: false }, select: { id: true } });
    if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
    const type = await prismaClient.invitationType.findFirst({ where: { id: data.typeId, active: true }, select: { id: true } });
    if (!type) throw new AppError("INVITATION_TYPE_INVALID", "Tipo de invitación no válido", 400);

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
            createdBy: { select: USER_PUBLIC_SELECT }
        }
    });
};

export const updateInvitationStatus = async (
    id: number,
    status: 'ENTERED' | 'EXITED' | 'CANCELLED',
    reason?: string,
    actorId?: number,
) => {
    const current = await prismaClient.invitation.findUnique({
        where: { id },
        select: { status: true, notes: true, validFrom: true, validUntil: true, propertyId: true, code: true },
    });
    if (!current) throw new AppError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
    assertTransition(INVITATION_TRANSITIONS, current.status, status);

    let accessReason: string | undefined;

    // La entrada solo vale dentro de la ventana que la residente definió.
    if (status === 'ENTERED') {
        const now = new Date();
        if (now < current.validFrom || now > current.validUntil) {
            throw new AppError("INVITATION_NOT_VALID", "La invitación no está vigente en este momento", 409);
        }

        // Fase 2A: si la propiedad está morosa, también se bloquean sus visitas.
        const access = await getPropertyAccessStatus(current.propertyId);
        if (access.blocked && access.blockVisitors) {
            await recordAccessEvent({
                propertyId: current.propertyId,
                invitationId: id,
                method: AccessMethod.QR,
                direction: AccessDirection.ENTRY,
                decision: AccessDecision.DENIED,
                reason: access.reason,
                guardId: actorId ?? null,
                metadata: { code: current.code, overdueDays: access.overdueDays },
            });
            throw new AppError(
                "ACCESS_BLOCKED_BY_DEBT",
                "La propiedad tiene adeudo. La administración debe autorizar el acceso.",
                403,
            );
        }

        // Si hay una excepción vigente, el evento deja constancia del motivo.
        accessReason = access.reason;
    }

    const data: any = { status };
    if (status === 'ENTERED') data.entryTime = new Date();
    if (status === 'EXITED') data.exitTime = new Date();
    if (status === 'CANCELLED' && reason?.trim()) {
        data.notes = current.notes ? `${current.notes}\n[Revocación] ${reason.trim()}` : `[Revocación] ${reason.trim()}`;
    }

    const { count } = await prismaClient.invitation.updateMany({ where: { id, status: current.status }, data });
    assertStatusUpdated(count);

    if (status === 'ENTERED' || status === 'EXITED') {
        await recordAccessEvent({
            propertyId: current.propertyId,
            invitationId: id,
            method: AccessMethod.QR,
            direction: status === 'ENTERED' ? AccessDirection.ENTRY : AccessDirection.EXIT,
            decision: AccessDecision.ALLOWED,
            reason: status === 'ENTERED' ? accessReason ?? 'CLEAR' : 'EXIT',
            guardId: actorId ?? null,
            metadata: { code: current.code },
        });
    }

    return prismaClient.invitation.findUniqueOrThrow({ where: { id } });
};
