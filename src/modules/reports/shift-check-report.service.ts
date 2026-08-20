import { prismaClient } from "@src/core/config/database";
import { PdfReportItem } from "./pdf-report.renderer";

/**
 * @description Items de ShiftCheck para alimentar el PDF. Mapea al contrato
 * `PdfReportItem` reusando el renderer genérico.
 */
const toPdfReportItem = (sc: any): PdfReportItem => {
    const caseta = casetaSummary(sc);
    const description = [sc.observations ?? "", caseta].filter(Boolean).join(" | ") || null;
    return {
        id: hashId(sc.id),
        title: titleFor(sc),
        description,
        status: sc.status === "SIGNED" ? "ATTENDED": "PENDING",
        createdAt: sc.actualEntryAt ?? sc.scheduledStartAt ?? sc.shiftDate,
        resolvedAt: sc.signedAt ?? null,
        resolvedByName: sc.signedBy
            ? `${sc.signedBy.name} ${sc.signedBy.lastName ?? ""}`.trim(): null,
        guardName: sc.user
            ? `${sc.user.name} ${sc.user.lastName ?? ""}`.trim(): `User #${sc.userId}`,
        guardUsername: sc.user?.username ?? "N/A",
        categoryName: deriveCategoryName(sc),
        typeName: deriveTypeName(sc),
        latitude: null,
        longitude: null,
        media: [],
    };
};

const hashId = (uuid: string): number => {
    let h = 0;
    for (let i = 0; i < uuid.length; i++) h = (h * 31 + uuid.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
};

const titleFor = (sc: any): string => {
    const parts: string[] = [];
    parts.push(sc.shiftType);
    if (sc.isAbsent) parts.push("FALTA");
    else if (sc.isLate) parts.push(`RETARDO ${sc.delayMinutes}m`);
    else parts.push("Puntual");
    return parts.join(" · ");
};

const casetaSummary = (sc: any): string => {
    const parts: string[] = [];
    if (sc.credentialsCount !== null && sc.credentialsCount !== undefined) {
        parts.push(`Credenciales: ${sc.credentialsCount}`);
    }
    if (sc.tarjetonesCount !== null && sc.tarjetonesCount !== undefined) {
        parts.push(`Tarjetones: ${sc.tarjetonesCount}`);
    }
    if (sc.novedadesCaseta) {
        parts.push(`Novedades: ${sc.novedadesCaseta}`);
    }
    return parts.join(" | ");
};

const deriveCategoryName = (sc: any): string => {
    if (sc.isAbsent) return "Falta";
    if (sc.isLate) return "Retardo";
    if (sc.handoverItems && Object.values(sc.handoverItems).some((v: any) => v && v.value === false))
        return "Entrega";
    return "Verificación";
};

const deriveTypeName = (sc: any): string => {
    if (sc.isAbsent) return "Falta injustificada";
    if (sc.isLate) return sc.delayMinutes >= 15 ? "Retardo grave": "Retardo leve";
    return "—";
};

/**
 * @description dataset para reporte de asistencia y puntualidad por
 * periodo. Acepta filtro opcional por `userId` y `ids` (cuando el cliente
 * seleccionó filas específicas).
 */
export const getShiftChecksForReport = async (params: {
    startDate: Date;
    endDate: Date;
    ids?: string[];
    userId?: number;
}): Promise<PdfReportItem[]> => {
    const { startDate, endDate, ids, userId } = params;
    const rangeStart = new Date(startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const where: any = {
        shiftDate: { gte: rangeStart, lte: rangeEnd },
    };
    if (ids && ids.length > 0) where.id = { in: ids };
    if (userId) where.userId = userId;

    const rows = await prismaClient.shiftCheck.findMany({
        where,
        orderBy: [{ shiftDate: "desc" }, { shiftType: "asc" }],
        include: {
            user: { select: { name: true, lastName: true, username: true } },
            signedBy: { select: { name: true, lastName: true } },
        },
    });
    return rows.map(toPdfReportItem);
};

/**
 * @description expediente individual por elemento.
 */
export const getShiftChecksByElementForReport = async (params: {
    userId: number;
    startDate: Date;
    endDate: Date;
}): Promise<PdfReportItem[]> => {
    return getShiftChecksForReport({
        startDate: params.startDate,
        endDate: params.endDate,
        userId: params.userId,
    });
};

export interface ShiftSummaryMetrics {
    total: number;
    signed: number;
    lateCount: number;
    absentCount: number;
    perUser: Array<{
        userId: number;
        userName: string;
        total: number;
        signed: number;
        late: number;
        absent: number;
        uniformFails: number;
    }>;
}

/**
 * @description métricas agregadas (sin PDF). Útil para dashboard y para
 * alimentar el reporte consolidado.
 */
export const getShiftChecksSummary = async (params: {
    startDate: Date;
    endDate: Date;
}): Promise<ShiftSummaryMetrics> => {
    const { startDate, endDate } = params;
    const rangeStart = new Date(startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const rows = await prismaClient.shiftCheck.findMany({
        where: { shiftDate: { gte: rangeStart, lte: rangeEnd } },
        select: {
            userId: true,
            status: true,
            isLate: true,
            isAbsent: true,
            user: { select: { name: true, lastName: true } },
        },
    });

    // Métrica de uniforme ( desde la entidad independiente UniformCheck.
    const uniformRows = await prismaClient.uniformCheck.findMany({
        where: { checkedAt: { gte: rangeStart, lte: rangeEnd } },
        select: { userId: true, failedCount: true },
    });

    const total = rows.length;
    const signed = rows.filter((r: any) => r.status === "SIGNED").length;
    const lateCount = rows.filter((r: any) => r.isLate).length;
    const absentCount = rows.filter((r: any) => r.isAbsent).length;

    const uniformFailsByUser = new Map<number, number>;
    for (const ur of uniformRows) {
        uniformFailsByUser.set(ur.userId, (uniformFailsByUser.get(ur.userId) ?? 0) + ur.failedCount);
    }

    const perUserMap = new Map<number, ShiftSummaryMetrics["perUser"][number]>;
    for (const r of rows) {
        const u = perUserMap.get(r.userId) ?? {
            userId: r.userId,
            userName: r.user ? `${r.user.name} ${r.user.lastName ?? ""}`.trim(): `#${r.userId}`,
            total: 0,
            signed: 0,
            late: 0,
            absent: 0,
            uniformFails: uniformFailsByUser.get(r.userId) ?? 0,
        };
        u.total += 1;
        if (r.status === "SIGNED") u.signed += 1;
        if (r.isLate) u.late += 1;
        if (r.isAbsent) u.absent += 1;
        perUserMap.set(r.userId, u);
    }

    return {
        total,
        signed,
        lateCount,
        absentCount,
        perUser: Array.from(perUserMap.values()).sort((a, b) => b.total - a.total),
    };
};
