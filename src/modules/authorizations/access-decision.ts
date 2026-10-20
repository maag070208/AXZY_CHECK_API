/**
 * Decisión de acceso de una persona autorizada (03 §6). Función pura: recibe la autorización
 * y el instante ya convertido a la zona del cliente.
 *
 * - Revocada o fuera de vigencia → DENIED.
 * - Alcance distinto (peatón / vehículo) → DENIED.
 * - Fuera de días u horas → NEEDS_APPROVAL: el titular decide; no se rechaza en automático.
 */
export type AccessDecision = "AUTHORIZED" | "NEEDS_APPROVAL" | "DENIED";
export type AccessScope = "PEDESTRIAN" | "VEHICLE";

export interface Authorization {
  scope: "PEDESTRIAN" | "VEHICLE" | "BOTH";
  days: string; // "1,2,3" con 0=domingo … 6=sábado
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  validFrom: Date; // fecha (UTC medianoche)
  validUntil: Date | null;
  revokedAt: Date | null;
}

export interface Moment {
  date: Date; // fecha local del acceso (UTC medianoche)
  weekday: number; // 0-6 en la zona del cliente
  minutes: number; // minutos desde medianoche en la zona del cliente
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const decideAccess = (auth: Authorization, scope: AccessScope, at: Moment): { decision: AccessDecision; reason: string } => {
  if (auth.revokedAt) return { decision: "DENIED", reason: "REVOKED" };
  if (at.date < auth.validFrom) return { decision: "DENIED", reason: "NOT_YET_VALID" };
  if (auth.validUntil && at.date > auth.validUntil) return { decision: "DENIED", reason: "EXPIRED" };
  if (auth.scope !== "BOTH" && auth.scope !== scope) return { decision: "DENIED", reason: "SCOPE_MISMATCH" };

  const days = auth.days.split(",").map(Number);
  const minutes = at.minutes;
  const inSchedule =
    days.includes(at.weekday) && minutes >= toMinutes(auth.startTime) && minutes <= toMinutes(auth.endTime);
  return inSchedule ? { decision: "AUTHORIZED", reason: "IN_SCHEDULE" } : { decision: "NEEDS_APPROVAL", reason: "OUT_OF_SCHEDULE" };
};
