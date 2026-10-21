import { createHash, randomBytes } from "crypto";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { getSetting } from "@src/core/settings/app-settings.service";
import { enqueueOutbox } from "@src/core/outbox/outbox";
import { AccessScope, AccessDecision, decideAccess, Moment } from "./access-decision";

/**
 * Pide aprobación al titular: notificación en la app a los residentes titulares con cuenta.
 * Pasa por el outbox (reintentos, sin duplicar). Sin titular con cuenta, no hay a quién avisar.
 */
/** Un aviso por persona y propiedad cada 15 minutos (decisión del 2026-10-20). */
export const APPROVAL_NOTICE_WINDOW_MS = 15 * 60 * 1000;

const askHolderApproval = async (propertyId: number, personId: number, personName: string) => {
  const since = new Date(Date.now() - APPROVAL_NOTICE_WINDOW_MS);
  const recent = await prismaClient.outboxEvent.count({
    where: {
      type: "notification.send",
      createdAt: { gte: since },
      payload: { path: ["data", "personId"], equals: String(personId) },
    },
  });
  if (recent > 0) return;

  const holders = await prismaClient.resident.findMany({
    where: { propertyId, status: "ACTIVE", isPrimary: true, person: { userId: { not: null } } },
    select: { person: { select: { userId: true } } },
  });
  const userIds = holders.map((h) => h.person.userId as number);
  // Propiedad rentada: el propietario ausente recibe copia del aviso (03 §5 y T-A2-03).
  const property = await prismaClient.property.findUnique({
    where: { id: propertyId },
    select: { occupancyStatus: { select: { code: true } }, owner: { select: { userId: true } } },
  });
  if (property?.occupancyStatus.code === "RENTED" && property.owner?.userId) {
    userIds.push(property.owner.userId);
  }
  if (userIds.length === 0) return;
  await enqueueOutbox("notification.send", {
    userIds,
    title: "Visita fuera de horario",
    body: `${personName} pide entrar fuera de su horario autorizado. ¿Lo permites?`,
    data: { propertyId: String(propertyId), personId: String(personId), kind: "AUTHORIZATION_APPROVAL" },
  });
};

const notifyIfNeeded = async (decision: AccessDecision, propertyId: number, personId: number, personName: string) => {
  if (decision === "NEEDS_APPROVAL") await askHolderApproval(propertyId, personId, personName);
};

dayjs.extend(utc);
dayjs.extend(timezone);

export const createAuthorization = async (
  propertyId: number,
  input: { personId: number; scope: "PEDESTRIAN" | "VEHICLE" | "BOTH"; days: number[]; startTime: string; endTime: string; validFrom: string; validUntil?: string | null },
  actorId: number,
) => {
  if (input.startTime === input.endTime) throw new AppError("SCHEDULE_INVALID", "La hora de inicio y la de fin no pueden ser iguales", 400);
  const property = await prismaClient.property.findUnique({ where: { id: propertyId }, select: { softDelete: true } });
  if (!property || property.softDelete) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
  const person = await prismaClient.person.findUnique({ where: { id: input.personId }, select: { id: true } });
  if (!person) throw new AppError("PERSON_NOT_FOUND", "Persona no encontrada", 404);

  return prismaClient.propertyAuthorization.create({
    data: {
      propertyId,
      personId: input.personId,
      scope: input.scope,
      days: [...new Set(input.days)].sort().join(","),
      startTime: input.startTime,
      endTime: input.endTime,
      validFrom: new Date(input.validFrom),
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      createdById: actorId,
    },
  });
};

export const revokeAuthorization = async (authorizationId: number) => {
  const auth = await prismaClient.propertyAuthorization.findUnique({ where: { id: authorizationId } });
  if (!auth) throw new AppError("AUTHORIZATION_NOT_FOUND", "Autorización no encontrada", 404);
  if (auth.revokedAt) return auth;
  return prismaClient.propertyAuthorization.update({ where: { id: authorizationId }, data: { revokedAt: new Date() } });
};

export const listAuthorizations = (propertyId: number) =>
  prismaClient.propertyAuthorization.findMany({
    where: { propertyId },
    orderBy: { id: "desc" },
    include: { person: { select: { id: true, firstName: true, lastName: true } } },
  });

/** Hora local de la zona del cliente, como la usa la decisión de acceso. */
const momentAt = async (now: Date): Promise<Moment> => {
  const tz = await getSetting("app.timezone", "UTC");
  const local = dayjs(now).tz(tz);
  return {
    date: new Date(`${local.format("YYYY-MM-DD")}T00:00:00.000Z`),
    weekday: local.day(),
    minutes: local.hour() * 60 + local.minute(),
  };
};

/** Consulta de caseta: ¿puede entrar esta persona ahora? Usa la hora en la zona del cliente. */
export const checkAccess = async (propertyId: number, personId: number, scope: AccessScope, now = new Date()) => {
  const auth = await prismaClient.propertyAuthorization.findFirst({
    where: { propertyId, personId },
    orderBy: { id: "desc" },
  });
  if (!auth) return { decision: "DENIED" as const, reason: "NO_AUTHORIZATION" };
  const result = decideAccess(auth, scope, await momentAt(now));
  const person = await prismaClient.person.findUnique({ where: { id: personId }, select: { firstName: true } });
  await notifyIfNeeded(result.decision, propertyId, personId, person?.firstName ?? "Una persona");
  return result;
};

const hashPass = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Emite un pase permanente para la autorización. El token se devuelve una sola vez; en la base
 * solo queda su huella SHA-256. Emitir de nuevo invalida el pase anterior.
 */
export const issuePass = async (authorizationId: number) => {
  const auth = await prismaClient.propertyAuthorization.findUnique({ where: { id: authorizationId } });
  if (!auth) throw new AppError("AUTHORIZATION_NOT_FOUND", "Autorización no encontrada", 404);
  if (auth.revokedAt) throw new AppError("AUTHORIZATION_REVOKED", "La autorización está revocada", 409);
  const token = randomBytes(32).toString("base64url");
  await prismaClient.propertyAuthorization.update({ where: { id: authorizationId }, data: { passHash: hashPass(token) } });
  return { token };
};

/** Valida un pase escaneado en caseta. Misma decisión que la consulta por persona. */
export const verifyPass = async (token: string, scope: AccessScope, now = new Date()) => {
  const auth = await prismaClient.propertyAuthorization.findUnique({
    where: { passHash: hashPass(token) },
    include: { person: { select: { firstName: true, lastName: true } } },
  });
  if (!auth) return { decision: "DENIED" as const, reason: "UNKNOWN_PASS", person: null };
  const result = decideAccess(auth, scope, await momentAt(now));
  await notifyIfNeeded(result.decision, auth.propertyId, auth.personId, auth.person.firstName);
  return { ...result, person: { firstName: auth.person.firstName, lastName: auth.person.lastName } };
};
