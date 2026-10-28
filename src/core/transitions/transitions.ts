import { AssignmentStatus, ComplaintStatus, IncidentStatus, InvitationStatus, MaintenanceStatus } from "@prisma/client";
import { AppError } from "@src/core/errors/app-error";

/** Estados alcanzables desde cada estado. Un estado ausente de la tabla no tiene salidas. */
export type TransitionTable<S extends string> = { readonly [K in S]: readonly S[] };

/** [T-F0-08] Lanza AppError 409 si el cambio de `from` a `to` no está permitido. */
export const assertTransition = <S extends string>(table: TransitionTable<S>, from: S, to: S): void => {
  if (!table[from]?.includes(to)) {
    throw new AppError("INVALID_TRANSITION", `No se puede cambiar de ${from} a ${to}`, 409);
  }
};

/**
 * Valida que la escritura condicionada (`where: { status: current }`) afectó
 * una fila. Si no, otro proceso cambió el estado entre la lectura y la escritura.
 */
export const assertStatusUpdated = (count: number): void => {
  if (count === 0) {
    throw new AppError("STATUS_CHANGED", "El estado cambió mientras lo editabas; vuelve a intentar", 409);
  }
};

export const ASSIGNMENT_TRANSITIONS: TransitionTable<AssignmentStatus> = {
  PENDING: ["CHECKING"],
  CHECKING: ["UNDER_REVIEW", "REVIEWED", "ANOMALY"],
  UNDER_REVIEW: ["REVIEWED", "ANOMALY"],
  ANOMALY: ["UNDER_REVIEW", "REVIEWED"],
  REVIEWED: [],
};

export const INCIDENT_TRANSITIONS: TransitionTable<IncidentStatus> = {
  PENDING: ["ATTENDED"],
  ATTENDED: [],
};

export const MAINTENANCE_TRANSITIONS: TransitionTable<MaintenanceStatus> = {
  PENDING: ["ATTENDED"],
  ATTENDED: [],
};

export const INVITATION_TRANSITIONS: TransitionTable<InvitationStatus> = {
  PENDING: ["ENTERED", "CANCELLED", "EXPIRED"],
  ENTERED: ["EXITED"],
  EXITED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/** Buzón de quejas (módulo 13). La reapertura la hace el residente dentro de 7 días. */
export const COMPLAINT_TRANSITIONS: TransitionTable<ComplaintStatus> = {
  NEW: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_RESIDENT", "RESOLVED"],
  WAITING_RESIDENT: ["IN_REVIEW", "RESOLVED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: [],
  REOPENED: ["IN_REVIEW", "RESOLVED"],
};
