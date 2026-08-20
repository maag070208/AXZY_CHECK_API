import { prismaClient } from "@src/core/config/database";
import { ablyService } from "../novedades/ably.service";
import { NOTIFICATIONS_EVENT_SHIFT_INCIDENT, notificationsChannel } from "./notifications.constants";

/**
 * @description Publica una notificación push por Ably a todos los usuarios con
 * rol ADMIN/SHIFT cuando se generan incidencias automáticas por un ShiftCheck.
 * */
export const publishShiftIncident = async (params: {
    actorId: number;
    shiftCheckId: string;
    incidentIds: number[];
    summary: string;
}): Promise<void> => {
    if (!ablyService.isConfigured()) return;
    if (params.incidentIds.length === 0) return;

    // Lista destinatarios: todos los ADMIN + SHIFT activos.
    const recipients = await prismaClient.user.findMany({
        where: {
            active: true,
            softDelete: false,
            role: { name: { in: ["ADMIN", "SHIFT"] } },
        },
        select: { id: true },
    });

    const payload = {
        type: NOTIFICATIONS_EVENT_SHIFT_INCIDENT,
        actorId: params.actorId,
        shiftCheckId: params.shiftCheckId,
        incidentIds: params.incidentIds,
        summary: params.summary,
        timestamp: new Date().toISOString(),
    };

    await Promise.all(
        recipients.map((r) =>
            ablyService
                .getRest()
                .channels.get(notificationsChannel(r.id))
                .publish(NOTIFICATIONS_EVENT_SHIFT_INCIDENT, payload)
                .catch((err) => {
                    console.warn(`[Notifications] Ably publish failed for user ${r.id}:`, err);
                }),
        ),
    );
};

/**
 * @description Stub de email (Resend) — no se envía por defecto. Se cableará
 * cuando RESEND_API_KEY esté configurada en el entorno.  (alternativa
 * email).
 */
export const sendEmailNotification = async (params: {
    to: string[];
    subject: string;
    body: string;
}): Promise<void> => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn("[Notifications] RESEND_API_KEY no configurada; email omitido.");
        return;
    }
    // Implementación concreta se difiere a integración real con Resend
    // (ver deps `resend` en package.json). Se deja el stub documentado.
    console.log("[Notifications] Stub email →", params.to, params.subject);
};
