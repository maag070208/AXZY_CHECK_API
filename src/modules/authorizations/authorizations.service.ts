import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { getSetting } from "@src/core/settings/app-settings.service";
import { AccessScope, decideAccess, Moment } from "./access-decision";

dayjs.extend(utc);
dayjs.extend(timezone);

export const createAuthorization = async (
  propertyId: number,
  input: { personId: number; scope: "PEDESTRIAN" | "VEHICLE" | "BOTH"; days: number[]; startTime: string; endTime: string; validFrom: string; validUntil?: string | null },
  actorId: number,
) => {
  if (input.startTime >= input.endTime) throw new AppError("SCHEDULE_INVALID", "La hora de inicio debe ser anterior a la de fin", 400);
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

/** Consulta de caseta: ¿puede entrar esta persona ahora? Usa la hora en la zona del cliente. */
export const checkAccess = async (propertyId: number, personId: number, scope: AccessScope, now = new Date()) => {
  const auth = await prismaClient.propertyAuthorization.findFirst({
    where: { propertyId, personId },
    orderBy: { id: "desc" },
  });
  if (!auth) return { decision: "DENIED" as const, reason: "NO_AUTHORIZATION" };

  const tz = await getSetting("app.timezone", "UTC");
  const local = dayjs(now).tz(tz);
  const at: Moment = {
    date: new Date(`${local.format("YYYY-MM-DD")}T00:00:00.000Z`),
    weekday: local.day(),
    minutes: local.hour() * 60 + local.minute(),
  };
  return decideAccess(auth, scope, at);
};
