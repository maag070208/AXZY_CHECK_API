import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, INVITATION_TRANSITIONS } from "@src/core/transitions/transitions";
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { AccessDecision, AccessDirection, AccessMethod, Invitation, InvitationStatus, Prisma, ResidentStatus } from "@prisma/client";
import {
    ACCESS_REASON_LABEL,
    getPropertyAccessStatus,
    propertyInScope,
    propertyReferenceInScope,
    recordAccessEvent,
} from "../access-control/access-control.service";
import { ABLY_CHANNELS, publishToChannel } from "@src/core/config/ably";
import { reportTimeZone } from "@src/client/branding";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { enqueueOutbox } from "@src/core/outbox/outbox";
import { getSetting } from "@src/core/settings/app-settings.service";
import {
    findResidentOrLegacyPropertyId,
    residentOwnsProperty as residentOwnsPropertyShared,
} from "../residents/resident-property.service";
import { ClientScope, scopeByProperty } from "@src/core/scope/client-scope";

/** Vigencia de una visita sin cita: desde que llega hasta esta cantidad de horas. */
const WALK_IN_HOURS = 4;
/** Estados que todavía pueden llegar a la caseta; el vencimiento los cierra. */
const OPEN_STATUSES: InvitationStatus[] = ["PENDING", "PENDING_APPROVAL"];
/** Zona horaria del residencial para agrupar por día y hora en los indicadores. */

function generateCode() {
    return 'AXZ-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Placa en formato comparable: solo A-Z y 0-9, en mayúsculas ("abc-123" → "ABC123"). */
export const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Usuarios (cuentas RESDN) con vínculo activo a la propiedad: a quienes se avisa. */
const residentUserIdsOfProperty = async (propertyId: number): Promise<number[]> => {
    const rows = await prismaClient.resident.findMany({
        where: { propertyId, status: ResidentStatus.ACTIVE, property: { softDelete: false } },
        select: { person: { select: { userId: true } } },
    });
    const ids = rows.map((row) => row.person.userId).filter((id): id is number => id != null);
    return [...new Set(ids)];
};

export const getDataTableInvitations = async (
    params: ITDataTableFetchParams,
    scope: ClientScope | undefined,
    options: { residentUserId?: number } = {},
): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);
    const filters = params.filters || {};
    // Multicliente: el personal solo ve invitaciones de su cliente; el residente, además, solo las suyas.
    // El residente sin cliente en el token queda acotado por `createdById`, que ya impone el servidor.
    const scopeWhere = options.residentUserId !== undefined
        ? (scope?.clientId ? scopeByProperty(scope) : {})
        : scopeByProperty(scope);
    prismaParams.where = { ...prismaParams.where, ...scopeWhere };

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

    // 2. Handle Combined Search: código, nombre o placa esperada
    const searchVal = String(filters.search || filters.code || "").trim();
    if (searchVal.length > 0) {
        // Clean up individual field filters added by utility
        delete prismaParams.where.code;
        delete prismaParams.where.guestName;
        delete prismaParams.where.search;

        const plate = normalizePlate(searchVal);
        prismaParams.where = {
            ...prismaParams.where,
            OR: [
                { code: { contains: String(searchVal), mode: 'insensitive' } },
                { guestName: { contains: String(searchVal), mode: 'insensitive' } },
                ...(plate ? [{ expectedPlate: { contains: plate, mode: 'insensitive' as const } }] : []),
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

type CreateInvitationInput = {
    guestName: string;
    createdById: number;
    propertyId: number;
    validFrom: Date;
    validUntil: Date;
    notes?: string;
    typeId: number;
    expectedPlate?: string | null;
    /** Solo caseta. Fija la vigencia desde ahora y, si el tipo lo exige, deja la visita por autorizar. */
    walkIn?: boolean;
};

export const createInvitation = async (
    data: CreateInvitationInput,
    scope: ClientScope | undefined,
    options: { residentUserId?: number } = {},
) => {
    // Alta: el personal solo puede invitar para propiedades de su cliente (referencia ajena = 400). El residente
    // ya pasó la validación de "solo su propiedad" en el controlador; si el token trae cliente, también se exige.
    if (options.residentUserId !== undefined) {
        const property = await prismaClient.property.findFirst({ where: { id: data.propertyId, softDelete: false }, select: { id: true } });
        if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
        if (scope?.clientId) await propertyInScope(data.propertyId, scope);
    } else {
        await propertyReferenceInScope(data.propertyId, scope);
    }
    const type = await prismaClient.invitationType.findFirst({
        where: { id: data.typeId, active: true },
        select: { id: true, requiresApproval: true },
    });
    if (!type) throw new AppError("INVITATION_TYPE_INVALID", "Tipo de invitación no válido", 400);

    const walkIn = data.walkIn === true;
    const now = new Date();
    const validFrom = walkIn ? now : data.validFrom;
    const validUntil = walkIn ? new Date(now.getTime() + WALK_IN_HOURS * 3600_000) : data.validUntil;
    const status: InvitationStatus = walkIn && type.requiresApproval ? "PENDING_APPROVAL" : "PENDING";
    const expectedPlate = data.expectedPlate ? normalizePlate(data.expectedPlate) || null : null;

    let uniqueCode = generateCode();

    // Ensure uniqueness
    let exists = await prismaClient.invitation.findUnique({ where: { code: uniqueCode } });
    while (exists) {
        uniqueCode = generateCode();
        exists = await prismaClient.invitation.findUnique({ where: { code: uniqueCode } });
    }

    const invitation = await prismaClient.invitation.create({
        data: {
            code: uniqueCode,
            guestName: data.guestName,
            createdById: data.createdById,
            propertyId: data.propertyId,
            typeId: data.typeId,
            notes: data.notes,
            expectedPlate,
            walkIn,
            status,
            validFrom,
            validUntil,
        },
        include: {
            property: true,
            type: true,
            createdBy: {
                select: { id: true, name: true, lastName: true }
            }
        }
    });

    if (status === "PENDING_APPROVAL") {
        const userIds = await residentUserIdsOfProperty(data.propertyId);
        if (userIds.length > 0) {
            await enqueueOutbox('notification.send', {
                userIds,
                title: 'Visita sin cita por autorizar',
                body: `${data.guestName} llegó a la caseta y pide acceso. Autorízala o recházala.`,
                data: { type: 'INVITATION_APPROVAL', invitationId: String(invitation.id), code: uniqueCode },
            });
        }
    }

    notifyCaseta();
    return invitation;
};

/** Aviso a la caseta de que cambió una visita. Solo es la señal de recargar: no lleva datos de la visita. */
const notifyCaseta = () => void publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, "refresh", { reason: "invitation-updated" });

/**
 * Por qué un pase no puede entrar ahora, con los códigos de la bitácora. Null si puede entrar o si ya está
 * dentro: ahí toca registrar su salida, no es un intento rechazado.
 */
const entryDenialReason = (pass: Pick<Invitation, "status" | "validFrom" | "validUntil">, now = new Date()) => {
    switch (pass.status) {
        case "EXPIRED": return "EXPIRED";
        case "CANCELLED": return "REVOKED";
        case "EXITED": return "ALREADY_USED";
        case "PENDING_APPROVAL": return "NO_AUTHORIZATION";
        case "PENDING":
            if (now < pass.validFrom) return "NOT_YET_VALID";
            return now > pass.validUntil ? "EXPIRED" : null;
        default: return null;
    }
};

const recordDeniedEntry = (pass: { id: number; propertyId: number; code: string }, reason: string, guardId?: number) =>
    recordAccessEvent({
        propertyId: pass.propertyId,
        invitationId: pass.id,
        method: AccessMethod.QR,
        direction: AccessDirection.ENTRY,
        decision: AccessDecision.DENIED,
        reason,
        guardId: guardId ?? null,
        metadata: { code: pass.code },
    });

/** Lectura de un pase en caseta: devuelve el pase del cliente del guardia y deja en la bitácora el intento si no puede entrar. */
export const scanInvitation = async (code: string, guardId: number | undefined, scope: ClientScope | undefined) => {
    const invitation = await getInvitationByIdOrCode(code, scope);
    if (!invitation) throw new AppError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
    const denial = entryDenialReason(invitation);
    if (denial) await recordDeniedEntry(invitation, denial, guardId);
    return invitation;
};

export const getInvitationByIdOrCode = async (
    identifier: string,
    scope: ClientScope | undefined,
    options: { residentUserId?: number } = {},
) => {
    // Try as ID first, fallback to code
    let whereClause: any = { code: identifier };
    if (!isNaN(Number(identifier))) {
        whereClause = { id: Number(identifier) };
    }

    // Del personal se exige el cliente del alcance (otro cliente = 404). El residente sin cliente en el token
    // queda acotado por la comprobación de propiedad del controlador.
    const scopeWhere = options.residentUserId !== undefined
        ? (scope?.clientId ? scopeByProperty(scope) : {})
        : scopeByProperty(scope);

    return prismaClient.invitation.findFirst({
        where: { ...whereClause, ...scopeWhere },
        include: {
            property: true,
            createdBy: { select: USER_PUBLIC_SELECT }
        }
    });
};

/**
 * Revisa pases abiertos (por autorizar o pendientes) que ya vencieron sin entrar. Los marca EXPIRED y encola
 * una notificación in-app/push para quien los creó. Es idempotente: solo toca los estados abiertos y el cron
 * usa un advisory lock.
 */
export const expirePendingInvitations = async (now: Date = new Date()): Promise<number> => {
    const expired = await prismaClient.$transaction(async (tx) => {
        const rows = await tx.invitation.findMany({
            where: { status: { in: OPEN_STATUSES }, validUntil: { lt: now } },
            select: { id: true, code: true, guestName: true, createdById: true, property: { select: { identifier: true } } },
        });
        if (rows.length === 0) return 0;

        const ids = rows.map((row) => row.id);
        const { count } = await tx.invitation.updateMany({
            where: { id: { in: ids }, status: { in: OPEN_STATUSES } },
            data: { status: 'EXPIRED' },
        });

        for (const row of rows) {
            await enqueueOutbox('notification.send', {
                userIds: [row.createdById],
                title: 'Pase vencido',
                body: `La visita de ${row.guestName} a ${row.property.identifier} venció sin registrar entrada.`,
                data: {
                    type: 'INVITATION_EXPIRED',
                    invitationId: String(row.id),
                    code: row.code,
                },
            }, tx);
        }
        return count;
    });
    if (expired > 0) notifyCaseta();
    return expired;
};

export const updateInvitationStatus = async (
    id: number,
    status: 'ENTERED' | 'EXITED' | 'CANCELLED',
    reason?: string,
    actorId?: number,
    scope?: ClientScope,
    options: { residentUserId?: number } = {},
) => {
    // Del personal, la invitación de otro cliente es 404 (no se revela que existe). El residente ya pasó la
    // comprobación de propiedad del controlador; si el token trae cliente, el filtro también aplica.
    const scopeWhere = options.residentUserId !== undefined
        ? (scope?.clientId ? scopeByProperty(scope) : {})
        : scopeByProperty(scope);
    const current = await prismaClient.invitation.findFirst({
        where: { id, ...scopeWhere },
        select: { status: true, notes: true, validFrom: true, validUntil: true, propertyId: true, code: true, guestName: true, revokedReason: true, revokedAt: true },
    });
    if (!current) throw new AppError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);

    const denial = status === 'ENTERED' ? entryDenialReason(current) : null;
    if (denial) await recordDeniedEntry({ ...current, id }, denial, actorId);
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
    if (status === 'CANCELLED') {
        const cleanReason = reason?.trim();
        data.revokedReason = cleanReason ?? current.revokedReason ?? "Sin motivo registrado";
        data.revokedAt = new Date();
        data.revokedById = actorId ?? null;
        if (cleanReason) {
            data.notes = current.notes ? `${current.notes}\n[Revocación] ${cleanReason}` : `[Revocación] ${cleanReason}`;
        }
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

        // Aviso al residente de la casa: la visita entró o salió (cada quien puede apagarlo).
        const residentIds = await residentUserIdsOfProperty(current.propertyId);
        const subscribed = await prismaClient.user.findMany({
            where: { id: { in: residentIds }, visitAlertsEnabled: true },
            select: { id: true },
        });
        const userIds = subscribed.map((user) => user.id);
        if (userIds.length > 0) {
            const entered = status === 'ENTERED';
            await enqueueOutbox('notification.send', {
                userIds,
                title: entered ? 'Tu visita entró' : 'Tu visita salió',
                body: `${current.guestName} ${entered ? 'ya entró' : 'ya salió'}.`,
                data: { type: entered ? 'INVITATION_ENTERED' : 'INVITATION_EXITED', invitationId: String(id), code: current.code },
            });
        }
    }

    notifyCaseta();
    return prismaClient.invitation.findUniqueOrThrow({ where: { id } });
};

/**
 * Autoriza (PENDING) o rechaza (CANCELLED) una visita sin cita. El residente solo decide sobre su propiedad;
 * el jefe y el admin pueden escalar cualquiera. La primera decisión gana: si ya no está por autorizar, 409.
 */
export const decideVisitApproval = async (
    id: number,
    actor: { id: number; role: string },
    decision: "APPROVE" | "REJECT",
    reason?: string,
    scope?: ClientScope,
) => {
    const scopeWhere = actor.role === "RESDN"
        ? (scope?.clientId ? scopeByProperty(scope) : {})
        : scopeByProperty(scope);
    const current = await prismaClient.invitation.findFirst({
        where: { id, ...scopeWhere },
        select: { status: true, propertyId: true, validUntil: true },
    });
    if (!current) throw new AppError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
    if (actor.role === "RESDN" && !(await residentOwnsPropertyShared(actor.id, current.propertyId))) {
        throw new AppError("INVITATION_NOT_OWNED", "No tienes permisos para realizar esta acción", 403);
    }

    const next: InvitationStatus = decision === "APPROVE" ? "PENDING" : "CANCELLED";
    assertTransition(INVITATION_TRANSITIONS, current.status, next);

    const now = new Date();
    if (decision === "APPROVE" && now > current.validUntil) {
        throw new AppError("INVITATION_NOT_VALID", "La visita ya no está vigente", 409);
    }

    const update: Prisma.InvitationUncheckedUpdateManyInput = decision === "APPROVE"
        ? { status: "PENDING", approvedById: actor.id, approvedAt: now }
        : { status: "CANCELLED", revokedReason: reason?.trim() ?? "Rechazada", revokedAt: now, revokedById: actor.id };

    const { count } = await prismaClient.invitation.updateMany({ where: { id, status: "PENDING_APPROVAL" }, data: update });
    assertStatusUpdated(count);
    notifyCaseta();
    return prismaClient.invitation.findUniqueOrThrow({ where: { id } });
};

/** Visitas sin cita esperando decisión. El residente ve las de su casa; jefe y admin, las de su cliente. */
export const listPendingApprovals = async (actor: { id: number; role: string }, scope: ClientScope | undefined) => {
    let propertyId: number | null = null;
    if (actor.role === "RESDN") {
        propertyId = await findResidentOrLegacyPropertyId(actor.id);
        if (propertyId === null) return [];
    }
    const scopeWhere = actor.role === "RESDN"
        ? (scope?.clientId ? scopeByProperty(scope) : {})
        : scopeByProperty(scope);
    return prismaClient.invitation.findMany({
        where: { status: "PENDING_APPROVAL", ...(propertyId !== null ? { propertyId } : {}), ...scopeWhere },
        include: {
            property: { select: { id: true, name: true, identifier: true } },
            type: true,
            createdBy: { select: { id: true, name: true, lastName: true } },
        },
        orderBy: { createdAt: "asc" },
    });
};

/** ¿El usuario recibe avisos cuando sus visitas entran o salen? */
export const getVisitAlerts = async (userId: number) => {
    const user = await prismaClient.user.findUniqueOrThrow({ where: { id: userId }, select: { visitAlertsEnabled: true } });
    return { enabled: user.visitAlertsEnabled };
};

export const setVisitAlerts = async (userId: number, enabled: boolean) => {
    await prismaClient.user.update({ where: { id: userId }, data: { visitAlertsEnabled: enabled } });
    return { enabled };
};

/** Duración máxima de permanencia (horas) configurable en AppSetting `visit.maxStayHours`. */
export const getMaxStayHours = async (): Promise<number> => Number(await getSetting("visit.maxStayHours", "12"));

/** Visitas dentro que ya rebasaron la permanencia máxima o el horario de su pase. */
const overstayedInvitationIds = async (now: Date, maxStayHours: number, where: Prisma.InvitationWhereInput = {}): Promise<number[]> => {
    const inside = await prismaClient.invitation.findMany({
        where: { status: "ENTERED", ...where },
        select: { id: true, entryTime: true, validUntil: true },
    });
    const limitMs = maxStayHours * 3600_000;
    return inside
        .filter((row) => (row.entryTime && now.getTime() - row.entryTime.getTime() > limitMs) || now > row.validUntil)
        .map((row) => row.id);
};

/** Estado de la caseta que no es de reportes: límite de permanencia y visitas que lo rebasan ahora. */
export const getCasetaStatus = async (scope: ClientScope | undefined) => {
    const maxStayHours = await getMaxStayHours();
    const overstayedIds = await overstayedInvitationIds(new Date(), maxStayHours, scopeByProperty(scope));
    return { maxStayHours, overstayedIds };
};

/** Día (AAAA-MM-DD) y hora (0-23) de una fecha en la zona del residencial. */
const localParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: reportTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { day: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
};

/** Lunes (AAAA-MM-DD) de la semana de un día. */
const weekOf = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
};

/** Entradas y entregas por periodo, en orden cronológico. */
const countByPeriod = (rows: { period: string; delivery: boolean }[]) => {
    const totals = new Map<string, { count: number; deliveries: number }>();
    for (const { period, delivery } of rows) {
        const bucket = totals.get(period) ?? { count: 0, deliveries: 0 };
        bucket.count += 1;
        if (delivery) bucket.deliveries += 1;
        totals.set(period, bucket);
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, bucket]) => ({ period, ...bucket }));
};

const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null);

/**
 * Indicadores de visitas en un rango: entradas y entregas por día, semana y mes, horas pico, estancia promedio
 * (general y por casa), rechazos por motivo, visitas que rebasaron su tiempo y visitas sin salida. Se agrega en
 * memoria: el volumen por residencial es de cientos de visitas al mes.
 */
export const getVisitStats = async (params: { from: Date; to: Date; propertyId?: number }, scope: ClientScope | undefined) => {
    const { from, to, propertyId } = params;
    // Multicliente: los indicadores solo agregan datos del cliente del alcance; el filtro por propiedad se suma
    // (una propiedad de otro cliente no devuelve datos, tampoco revela que existe).
    const where: Prisma.InvitationWhereInput = { ...scopeByProperty(scope), ...(propertyId ? { propertyId } : {}) };
    const eventWhere: Prisma.AccessEventWhereInput = { ...scopeByProperty(scope), ...(propertyId ? { propertyId } : {}) };
    const now = new Date();
    const maxStayHours = await getMaxStayHours();

    const [entered, created, denied, overstayedIds] = await Promise.all([
        prismaClient.invitation.findMany({
            where: { ...where, entryTime: { gte: from, lte: to } },
            select: {
                propertyId: true,
                entryTime: true,
                exitTime: true,
                validUntil: true,
                property: { select: { identifier: true } },
                type: { select: { name: true } },
            },
        }),
        prismaClient.invitation.groupBy({
            by: ["status"],
            where: { ...where, validFrom: { gte: from, lte: to } },
            _count: { _all: true },
        }),
        prismaClient.accessEvent.findMany({
            where: { ...eventWhere, decision: AccessDecision.DENIED, occurredAt: { gte: from, lte: to } },
            select: { reason: true },
        }),
        overstayedInvitationIds(now, maxStayHours, where),
    ]);

    const stays = (rows: typeof entered) =>
        rows.filter((row) => row.exitTime && row.entryTime).map((row) => (row.exitTime!.getTime() - row.entryTime!.getTime()) / 60_000);

    const byHour = Array.from({ length: 24 }, () => 0);
    const visits = entered.flatMap((row) => {
        if (!row.entryTime) return [];
        const { day, hour } = localParts(row.entryTime);
        byHour[hour] += 1;
        return [{ day, delivery: row.type.name === "DELIVERY" }];
    });
    const groupedBy = (periodOf: (day: string) => string) =>
        countByPeriod(visits.map(({ day, delivery }) => ({ period: periodOf(day), delivery })));

    // Rebasó su tiempo: se quedó más que la permanencia máxima o más allá del horario de su pase.
    const limitMs = maxStayHours * 3600_000;
    const overstayed = (row: (typeof entered)[number], until: Date) =>
        !!row.entryTime && (until.getTime() - row.entryTime.getTime() > limitMs || until > row.validUntil);

    const byPropertyMap = new Map<number, { propertyId: number; identifier: string; entries: typeof entered }>();
    for (const row of entered) {
        const bucket = byPropertyMap.get(row.propertyId) ?? { propertyId: row.propertyId, identifier: row.property.identifier, entries: [] };
        bucket.entries.push(row);
        byPropertyMap.set(row.propertyId, bucket);
    }

    const rejectedByReason = new Map<string, number>();
    for (const event of denied) {
        const reason = event.reason ?? "Sin motivo";
        rejectedByReason.set(reason, (rejectedByReason.get(reason) ?? 0) + 1);
    }

    return {
        maxStayHours,
        entries: entered.length,
        averageStayMinutes: average(stays(entered)),
        byStatus: created.map((row) => ({ status: row.status, count: row._count._all })),
        deliveries: visits.filter((visit) => visit.delivery).length,
        byDay: groupedBy((day) => day),
        byWeek: groupedBy(weekOf),
        byMonth: groupedBy((day) => day.slice(0, 7)),
        byHour: byHour.map((count, hour) => ({ hour, count })),
        byProperty: [...byPropertyMap.values()]
            .map((bucket) => ({
                propertyId: bucket.propertyId,
                identifier: bucket.identifier,
                entries: bucket.entries.length,
                averageStayMinutes: average(stays(bucket.entries)),
            }))
            .sort((a, b) => b.entries - a.entries),
        rejected: {
            total: denied.length,
            byReason: [...rejectedByReason.entries()]
                .sort(([, a], [, b]) => b - a)
                .map(([reason, count]) => ({ reason, label: ACCESS_REASON_LABEL[reason] ?? reason, count })),
        },
        overstayedNow: overstayedIds.length,
        exceededStay: entered.filter((row) => row.exitTime && overstayed(row, row.exitTime)).length,
        noExit: entered.filter((row) => !row.exitTime && overstayed(row, now)).length,
    };
};
