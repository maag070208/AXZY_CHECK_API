/**
 * @description Cron de reincidencia: cuenta las incidencias automáticas por
 * verificación de turno (kind=INCIDENT con categorías SHIFT_*) generadas en
 * los últimos N días (default 30) por cada elemento. Si supera el umbral
 * configurado en SysConfig (`SHIFT_INCIDENT_COUNT_THRESHOLD`, default 3),
 * notifica a todos los ADMIN por Ably.
 *
 * Uso: ejecutar una vez al día, p.ej. 23:00.
 *   npm run cron:shift:reincidencia
 */
import { prismaClient } from "../src/core/config/database";
import { ablyService } from "../src/modules/novedades/ably.service";
import {
  NOTIFICATIONS_EVENT_SHIFT_INCIDENT,
  notificationsChannel,
} from "../src/modules/notifications/notifications.constants";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_THRESHOLD = 3;

const getThreshold = async (): Promise<number> => {
    const cfg = await prismaClient.sysConfig.findUnique({
        where: { key: "SHIFT_INCIDENT_COUNT_THRESHOLD" },
    });
    if (!cfg) return DEFAULT_THRESHOLD;
    const n = Number(cfg.value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD;
};

const getShiftCategoryIds = async (): Promise<number[]> => {
    const cats = await prismaClient.incidentCategory.findMany({
        where: { type: "SHIFT" },
        select: { id: true },
    });
    return cats.map((c) => c.id);
};

async function main() {
    const threshold = await getThreshold();
    const days = DEFAULT_LOOKBACK_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const shiftCategoryIds = await getShiftCategoryIds();
    if (shiftCategoryIds.length === 0) {
        console.log("[shift-reincidencia] No hay categorías SHIFT; nada que hacer.");
        return;
    }

    const grouped = await prismaClient.incident.groupBy({
        by: ["guardId"],
        where: {
            kind: "INCIDENT",
            categoryId: { in: shiftCategoryIds },
            createdAt: { gte: since },
        },
        _count: { _all: true },
        orderBy: { _count: { guardId: "desc" } },
    });

    const offenders = grouped.filter((g) => g._count._all >= threshold);
    if (offenders.length === 0) {
        console.log(`[shift-reincidencia] Sin reincidentes (umbral=${threshold}, ventana=${days}d).`);
        return;
    }

    const guardIds = offenders.map((o) => o.guardId);
    const guards = await prismaClient.user.findMany({
        where: { id: { in: guardIds } },
        select: { id: true, name: true, lastName: true },
    });
    const guardMap = new Map(guards.map((g) => [g.id, g]));

    const admins = await prismaClient.user.findMany({
        where: {
            active: true,
            softDelete: false,
            role: { name: "ADMIN" },
        },
        select: { id: true },
    });
    if (admins.length === 0 || !ablyService.isConfigured()) {
        console.log("[shift-reincidencia] Sin destinatarios o Ably no configurado.");
        return;
    }

    const offendersDetail = offenders.map((o) => {
        const g = guardMap.get(o.guardId);
        return {
            guardId: o.guardId,
            guardName: g ? `${g.name} ${g.lastName ?? ""}`.trim() : `#${o.guardId}`,
            count: o._count._all,
        };
    });

    const summary =
        `Reincidencia: ${offendersDetail.length} elemento(s) superan ${threshold} ` +
        `incidencia(s) en ${days} días. Revisar para acta administrativa.`;

    const payload = {
        type: NOTIFICATIONS_EVENT_SHIFT_INCIDENT,
        reason: "reincidencia",
        threshold,
        days,
        offenders: offendersDetail,
        summary,
        timestamp: new Date().toISOString(),
    };

    await Promise.all(
        admins.map((a) =>
            ablyService
                .getRest()
                .channels.get(notificationsChannel(a.id))
                .publish(NOTIFICATIONS_EVENT_SHIFT_INCIDENT, payload)
                .catch((err) => {
                    console.warn(
                        `[shift-reincidencia] Ably publish failed for admin ${a.id}:`,
                        err,
                    );
                }),
        ),
    );
    console.log(`[shift-reincidencia] Notificación enviada a ${admins.length} ADMIN.`);
}

main()
    .catch((err) => {
        console.error("[shift-reincidencia] Error:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prismaClient.$disconnect();
    });
