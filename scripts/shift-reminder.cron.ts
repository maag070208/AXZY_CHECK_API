/**
 * @description Cron de recordatorios de Verificación de Cambio de Turno.
 * Corre a las 7am (recordatorio MATUTINO) y 7pm (recordatorio NOCTURNO).
 * Por cada Schedule activo, verifica si ya existe un ShiftCheck del día para
 * los usuarios asignados y, si falta, notifica a los ADMIN/SHIFT por Ably.
 *
 * Se invoca desde `npm run start:cron:shift` (ver package.json).
 */
import { prismaClient } from "../src/core/config/database";
import { ablyService } from "../src/modules/novedades/ably.service";
import {
  NOTIFICATIONS_EVENT_SHIFT_INCIDENT,
  notificationsChannel,
} from "../src/modules/notifications/notifications.constants";

const WINDOW_MINUTES = 30;

const withinWindow = (now: Date, hhmm: string): boolean => {
    const m = /^([0-2]?\d):([0-5]\d)$/.exec(hhmm);
    if (!m) return false;
    const target = new Date(now);
    target.setHours(Number(m[1]), Number(m[2]), 0, 0);
    const diffMs = Math.abs(now.getTime() - target.getTime());
    return diffMs <= WINDOW_MINUTES * 60 * 1000;
};

const shiftTypeForHour = (now: Date): "MATUTINO" | "NOCTURNO" => {
    const h = now.getHours();
    return h < 12 ? "MATUTINO" : "NOCTURNO";
};

async function main() {
    const now = new Date();
    const currentShiftType = shiftTypeForHour(now);

    const schedules = await prismaClient.schedule.findMany({
        where: { active: true },
    });

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const dueSchedules = schedules.filter((s) => withinWindow(now, s.startTime));
    if (dueSchedules.length === 0) {
        console.log(`[shift-reminder] No hay schedules en ventana ${WINDOW_MINUTES}min.`);
        return;
    }

    const recipients = await prismaClient.user.findMany({
        where: {
            active: true,
            softDelete: false,
            role: { name: { in: ["ADMIN", "SHIFT"] } },
        },
        select: { id: true },
    });
    if (recipients.length === 0 || !ablyService.isConfigured()) {
        console.log("[shift-reminder] Sin destinatarios o Ably no configurado.");
        return;
    }

    for (const schedule of dueSchedules) {
        // Usuarios asignados a este schedule.
        const users = await prismaClient.user.findMany({
            where: {
                scheduleId: schedule.id,
                active: true,
                softDelete: false,
            },
            select: { id: true },
        });
        if (users.length === 0) continue;

        const userIds = users.map((u) => u.id);
        const alreadyDone = await prismaClient.shiftCheck.findMany({
            where: {
                shiftDate: { gte: dayStart, lte: dayEnd },
                shiftType: currentShiftType,
                userId: { in: userIds },
            },
            select: { userId: true },
        });
        const doneSet = new Set(alreadyDone.map((d) => d.userId));
        const pending = userIds.filter((id) => !doneSet.has(id));

        if (pending.length === 0) {
            console.log(`[shift-reminder] Schedule ${schedule.name}: todos capturados.`);
            continue;
        }

        const summary =
            `Recordatorio: ${pending.length} verificación(es) de turno ${currentShiftType} ` +
            `del schedule "${schedule.name}" aún sin capturar.`;

        const payload = {
            type: NOTIFICATIONS_EVENT_SHIFT_INCIDENT,
            shiftType: currentShiftType,
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            pendingUserIds: pending,
            summary,
            timestamp: now.toISOString(),
        };

        await Promise.all(
            recipients.map((r) =>
                ablyService
                    .getRest()
                    .channels.get(notificationsChannel(r.id))
                    .publish(NOTIFICATIONS_EVENT_SHIFT_INCIDENT, payload)
                    .catch((err) => {
                        console.warn(
                            `[shift-reminder] Ably publish failed for user ${r.id}:`,
                            err,
                        );
                    }),
            ),
        );
        console.log(`[shift-reminder] Notificación enviada: ${summary}`);
    }
}

main()
    .catch((err) => {
        console.error("[shift-reminder] Error:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prismaClient.$disconnect();
    });
