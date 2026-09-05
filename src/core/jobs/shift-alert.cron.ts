import cron from "node-cron";
import { prismaClient } from "@src/core/config/database";
import { publishToChannel, ABLY_CHANNELS } from "@src/core/config/ably";

/**
 * @description Registers the two daily cron jobs that remind the jefe
 * operativo (rol SHIFT) to submit the shift-handover report — 7:00 AM and
 * 7:00 PM per `ajustes/bonaterra_ajuste_2.md` (4.2). Times and timezone are
 * read once at startup from `SysConfig` (`SHIFT_ALERT_MORNING_TIME`,
 * `SHIFT_ALERT_EVENING_TIME`, `SHIFT_ALERT_TIMEZONE`) so an admin can adjust
 * them without a code change — a running server needs a restart to pick up
 * a change, which is an accepted trade-off to keep this simple.
 *
 * The alert itself is a best-effort Ably publish consumed live by the APP
 * banner (`shift-handover:alerts`); it never throws. `GET /shift-handover/pending`
 * is the real source of truth and is what the banner falls back to polling,
 * so a missed/failed publish here never hides that a report is due.
 */
export const registerShiftAlertCron = async (): Promise<void> => {
  try {
    const [morningRow, eveningRow, tzRow] = await Promise.all([
      prismaClient.sysConfig.findUnique({ where: { key: "SHIFT_ALERT_MORNING_TIME" } }),
      prismaClient.sysConfig.findUnique({ where: { key: "SHIFT_ALERT_EVENING_TIME" } }),
      prismaClient.sysConfig.findUnique({ where: { key: "SHIFT_ALERT_TIMEZONE" } }),
    ]);

    const morningTime = morningRow?.value ?? "07:00";
    const eveningTime = eveningRow?.value ?? "19:00";
    const tzValue = tzRow?.value ?? "America/Tijuana";

    const [morningHour, morningMinute] = morningTime.split(":").map(Number);
    const [eveningHour, eveningMinute] = eveningTime.split(":").map(Number);

    const scheduleAlert = (hour: number, minute: number, shiftType: "MATUTINO" | "NOCTURNO") => {
      const cronExpression = `${minute} ${hour} * * *`;
      cron.schedule(
        cronExpression,
        async () => {
          try {
            console.log(`[ShiftAlert] Disparando alerta de entrega de turno (${shiftType})`);
            await publishToChannel(ABLY_CHANNELS.SHIFT_ALERTS, "shift-reminder", {
              shiftType,
              message:
                shiftType === "NOCTURNO"
                  ? "Recuerda enviar el reporte de entrega de turno nocturno."
                  : "Recuerda enviar el reporte de entrega de turno matutino.",
              triggeredAt: new Date().toISOString(),
            });
          } catch (error) {
            console.error("[ShiftAlert] Error al disparar la alerta:", error);
          }
        },
        { timezone: tzValue },
      );
    };

    // 07:00 -> reminds about the NOCTURNO shift that just ended.
    scheduleAlert(morningHour, morningMinute, "NOCTURNO");
    // 19:00 -> reminds about the MATUTINO shift that just ended.
    scheduleAlert(eveningHour, eveningMinute, "MATUTINO");

    console.log(
      `[ShiftAlert] Cron registrado — alerta Nocturno ${morningTime}, alerta Matutino ${eveningTime} (${tzValue})`,
    );
  } catch (error) {
    console.error("[ShiftAlert] No se pudo registrar el cron de alertas de turno:", error);
  }
};
