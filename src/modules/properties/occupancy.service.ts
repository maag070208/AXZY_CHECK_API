import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { getSetting } from "@src/core/settings/app-settings.service";
import { recountResidents } from "./resident-count";

dayjs.extend(utc);
dayjs.extend(timezone);

type Tx = Prisma.TransactionClient;

/** Fecha de hoy en la zona horaria del cliente, como fecha sin hora (UTC medianoche). */
export const todayDateOnly = async (): Promise<Date> => {
  const tz = await getSetting("app.timezone", "UTC");
  return new Date(`${dayjs().tz(tz).format("YYYY-MM-DD")}T00:00:00.000Z`);
};

/** Tipo y ocupación iniciales a partir de los catálogos anteriores (PropertyType/PropertyStatus). */
const LEGACY_TYPE_TO_KIND: Record<string, string> = { CASA: "HOUSE", DEPA: "APARTMENT", TERRE: "LOT" };
const LEGACY_STATUS_TO_OCCUPANCY: Record<string, string> = {
  VACNT: "VACANT",
  HABIT: "OWNER_OCCUPIED",
  CONST: "UNDER_CONSTRUCTION",
  BLOCK: "BLOCKED",
};

export const resolveKindAndOccupancy = async (
  tx: Tx,
  input: { kindId?: number; occupancyStatusId?: number; typeId?: number; statusId?: number },
) => {
  let kindId = input.kindId;
  if (!kindId && input.typeId) {
    const legacy = await tx.propertyType.findUnique({ where: { id: input.typeId } });
    const code = legacy ? LEGACY_TYPE_TO_KIND[legacy.name] : undefined;
    const kind = code ? await tx.propertyKind.findUnique({ where: { code } }) : null;
    kindId = kind?.id;
  }
  let occupancyStatusId = input.occupancyStatusId;
  if (!occupancyStatusId && input.statusId) {
    const legacy = await tx.propertyStatus.findUnique({ where: { id: input.statusId } });
    const code = legacy ? LEGACY_STATUS_TO_OCCUPANCY[legacy.name] : undefined;
    const status = code ? await tx.occupancyStatus.findUnique({ where: { code } }) : null;
    occupancyStatusId = status?.id;
  }
  if (!kindId) throw new AppError("PROPERTY_KIND_REQUIRED", "Indica el tipo de propiedad", 400);
  if (!occupancyStatusId) throw new AppError("OCCUPANCY_REQUIRED", "Indica la ocupación inicial", 400);
  return { kindId, occupancyStatusId };
};

/** Reglas que aplican a cualquier estado de ocupación nuevo (creación o cambio). */
const assertOccupancyRules = (status: { code: string }, tenantPersonId?: number | null) => {
  if (status.code === "RENTED" && !tenantPersonId) {
    throw new AppError("OCCUPANCY_TENANT_REQUIRED", "Una propiedad rentada necesita un inquilino", 400);
  }
};

export const getOccupancy = async (propertyId: number) => {
  const property = await prismaClient.property.findUnique({
    where: { id: propertyId },
    select: { id: true, softDelete: true, residentCount: true, maxResidents: true, occupancyStatus: true, ownerPersonId: true },
  });
  if (!property || property.softDelete) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);

  const history = await prismaClient.occupancyPeriod.findMany({
    where: { propertyId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: {
      status: true,
      tenant: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const current = history.find((period) => period.endDate === null) ?? null;
  return {
    propertyId,
    status: property.occupancyStatus,
    residentCount: property.residentCount,
    maxResidents: property.maxResidents,
    overcrowded: property.maxResidents !== null && property.residentCount > property.maxResidents,
    current,
    history,
  };
};

/**
 * Cambia la ocupación de forma transaccional (T-A1-04): valida la transición (datos),
 * exige inquilino para RENTED, pide confirmar la baja de residentes si el nuevo estado no
 * los permite, cierra el periodo vigente, abre el nuevo y actualiza la copia derivada.
 */
export const changeOccupancy = async (
  propertyId: number,
  input: {
    status: string;
    tenantPersonId?: number | null;
    ownerPersonId?: number | null;
    releaseResidents?: boolean;
    notes?: string | null;
  },
  actorId: number,
) => {
  const today = await todayDateOnly();

  return prismaClient.$transaction(async (tx) => {
    const property = await tx.property.findUnique({
      where: { id: propertyId },
      select: { id: true, softDelete: true, occupancyStatusId: true, residentCount: true },
    });
    if (!property || property.softDelete) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);

    const current = await tx.occupancyStatus.findUniqueOrThrow({ where: { id: property.occupancyStatusId } });
    const target = await tx.occupancyStatus.findUnique({ where: { code: input.status } });
    if (!target || !target.active) throw new AppError("OCCUPANCY_STATUS_INVALID", "Estado de ocupación no válido", 400);

    const allowed = await tx.occupancyStatusTransition.findUnique({
      where: { fromId_toId: { fromId: current.id, toId: target.id } },
    });
    if (!allowed) {
      throw new AppError("INVALID_TRANSITION", `No se puede cambiar de ${current.code} a ${target.code}`, 409);
    }

    assertOccupancyRules(target, input.tenantPersonId);

    if (!target.allowsResidents && property.residentCount > 0) {
      if (!input.releaseResidents) {
        throw new AppError(
          "OCCUPANCY_HAS_RESIDENTS",
          "La propiedad tiene residentes activos; confirma su baja para continuar",
          409,
        );
      }
      await tx.user.updateMany({
        where: { propertyId, active: true, role: { name: "RESDN" } },
        data: { active: false },
      });
      await tx.resident.updateMany({
        where: { propertyId, status: "ACTIVE" },
        data: { status: "MOVED_OUT", endDate: today, isPrimary: false },
      });
    }

    const closed = await tx.occupancyPeriod.updateMany({
      where: { propertyId, endDate: null },
      data: { endDate: today },
    });
    if (closed.count !== 1) {
      throw new AppError("OCCUPANCY_NO_OPEN_PERIOD", "La propiedad no tiene un periodo vigente", 409);
    }

    const period = await tx.occupancyPeriod.create({
      data: {
        propertyId,
        statusId: target.id,
        startDate: today,
        tenantPersonId: input.tenantPersonId ?? null,
        ownerPersonId: input.ownerPersonId ?? null,
        notes: input.notes ?? null,
        createdById: actorId,
      },
    });

    await tx.property.update({ where: { id: propertyId }, data: { occupancyStatusId: target.id } });
    await recountResidents([propertyId], tx);

    return { period, status: target.code };
  });
};

/** Cambio de propietario, separado de la ocupación (T-A1-05). */
export const changeOwnership = async (
  propertyId: number,
  input: { toPersonId: number; notes?: string | null },
  actorId: number,
) =>
  prismaClient.$transaction(async (tx) => {
    const property = await tx.property.findUnique({
      where: { id: propertyId },
      select: { id: true, softDelete: true, ownerPersonId: true },
    });
    if (!property || property.softDelete) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);

    const change = await tx.ownershipChange.create({
      data: {
        propertyId,
        fromPersonId: property.ownerPersonId,
        toPersonId: input.toPersonId,
        changedById: actorId,
        notes: input.notes ?? null,
      },
    });
    await tx.property.update({ where: { id: propertyId }, data: { ownerPersonId: input.toPersonId } });
    return change;
  });
