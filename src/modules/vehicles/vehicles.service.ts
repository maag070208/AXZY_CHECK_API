import { AccessDecision, AccessDirection, AccessMethod, Prisma, VehicleStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { requireResidentPropertyId } from "../residents/resident-property.service";
import { getPropertyAccessStatus, recordAccessEvent } from "../access-control/access-control.service";

const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizeTag = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
const trimOrNull = (value?: string) => (value && value.trim() ? value.trim() : null);

const vehicleInclude = {
  property: { select: { id: true, identifier: true, name: true, vehicleQuota: true } },
  owner: { select: { id: true, name: true, lastName: true } },
  approvedBy: { select: { id: true, name: true, lastName: true } },
} satisfies Prisma.VehicleInclude;

const serializeVehicle = (vehicle: any) => ({
  id: vehicle.id,
  propertyId: vehicle.propertyId,
  property: vehicle.property,
  ownerId: vehicle.ownerId,
  owner: vehicle.owner,
  plate: vehicle.plate,
  plateNormalized: vehicle.plateNormalized,
  tagCode: vehicle.tagCode,
  kind: vehicle.kind,
  brand: vehicle.brand,
  model: vehicle.model,
  color: vehicle.color,
  status: vehicle.status,
  approvedBy: vehicle.approvedBy ?? null,
  approvedAt: vehicle.approvedAt?.toISOString() ?? null,
  notes: vehicle.notes,
  active: vehicle.active,
  createdAt: vehicle.createdAt.toISOString(),
});

const residentPropertyId = async (userId: number) => requireResidentPropertyId(userId);

const assertQuota = async (propertyId: number, excludeId?: number) => {
  const property = await prismaClient.property.findUnique({ where: { id: propertyId }, select: { vehicleQuota: true } });
  if (!property?.vehicleQuota) return;
  const count = await prismaClient.vehicle.count({
    where: {
      propertyId,
      active: true,
      status: { in: [VehicleStatus.PENDING, VehicleStatus.APPROVED] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (count >= property.vehicleQuota) {
    throw new AppError("VEHICLE_QUOTA_REACHED", `La propiedad ya tiene ${property.vehicleQuota} vehículos registrados`, 409);
  }
};

const assertPlateFree = async (propertyId: number, plateNormalized: string, excludeId?: number) => {
  const duplicate = await prismaClient.vehicle.findFirst({
    where: { propertyId, plateNormalized, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new AppError("VEHICLE_PLATE_DUPLICATE", "Ya hay un vehículo con esa placa en la propiedad", 409);
};

const generateTag = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tag = `TAG-${randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await prismaClient.vehicle.findUnique({ where: { tagCode: tag }, select: { id: true } });
    if (!exists) return tag;
  }
  throw new AppError("VEHICLE_TAG_ERROR", "No se pudo generar un tag; intenta de nuevo", 500);
};

export const listMyVehicles = async (userId: number) => {
  const propertyId = await residentPropertyId(userId);
  const vehicles = await prismaClient.vehicle.findMany({
    where: { propertyId, ownerId: userId, active: true },
    orderBy: { createdAt: "desc" },
    include: vehicleInclude,
  });
  return vehicles.map(serializeVehicle);
};

export const createMyVehicle = async (userId: number, input: { plate: string; kind?: string; brand?: string; model?: string; color?: string; notes?: string }) => {
  const propertyId = await residentPropertyId(userId);
  const plateNormalized = normalizePlate(input.plate);
  if (plateNormalized.length < 3) throw new AppError("VEHICLE_PLATE_INVALID", "La placa no es válida", 400);
  await assertQuota(propertyId);
  await assertPlateFree(propertyId, plateNormalized);
  const vehicle = await prismaClient.vehicle.create({
    data: {
      propertyId,
      ownerId: userId,
      plate: input.plate.trim().toUpperCase(),
      plateNormalized,
      kind: trimOrNull(input.kind),
      brand: trimOrNull(input.brand),
      model: trimOrNull(input.model),
      color: trimOrNull(input.color),
      notes: trimOrNull(input.notes),
      status: VehicleStatus.PENDING,
    },
    include: vehicleInclude,
  });
  return serializeVehicle(vehicle);
};

export const updateMyVehicle = async (userId: number, id: number, input: { plate: string; kind?: string; brand?: string; model?: string; color?: string; notes?: string }) => {
  const propertyId = await residentPropertyId(userId);
  const current = await prismaClient.vehicle.findFirst({ where: { id, ownerId: userId, propertyId, active: true } });
  if (!current) throw new AppError("VEHICLE_NOT_FOUND", "Vehículo no encontrado", 404);
  const plateNormalized = normalizePlate(input.plate);
  if (plateNormalized.length < 3) throw new AppError("VEHICLE_PLATE_INVALID", "La placa no es válida", 400);
  await assertPlateFree(propertyId, plateNormalized, id);
  const vehicle = await prismaClient.vehicle.update({
    where: { id },
    data: {
      plate: input.plate.trim().toUpperCase(),
      plateNormalized,
      kind: trimOrNull(input.kind),
      brand: trimOrNull(input.brand),
      model: trimOrNull(input.model),
      color: trimOrNull(input.color),
      notes: trimOrNull(input.notes),
      // Un cambio del residente vuelve a revisión y retira el tag hasta que se apruebe.
      status: VehicleStatus.PENDING,
      tagCode: null,
      approvedAt: null,
      approvedById: null,
    },
    include: vehicleInclude,
  });
  return serializeVehicle(vehicle);
};

export const deleteMyVehicle = async (userId: number, id: number) => {
  const vehicle = await prismaClient.vehicle.findFirst({ where: { id, ownerId: userId, active: true } });
  if (!vehicle) throw new AppError("VEHICLE_NOT_FOUND", "Vehículo no encontrado", 404);
  await prismaClient.vehicle.update({ where: { id }, data: { active: false, status: VehicleStatus.INACTIVE, tagCode: null } });
  return { id };
};

export const listVehicles = async (query: { page: number; pageSize: number; status?: VehicleStatus; search?: string }) => {
  const search = query.search ? query.search.trim().toUpperCase() : "";
  const where: Prisma.VehicleWhereInput = {
    active: true,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { plateNormalized: { contains: search.replace(/[^A-Z0-9]/g, "") } },
            { tagCode: { contains: search } },
            { owner: { name: { contains: query.search, mode: "insensitive" } } },
            { owner: { lastName: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await prismaClient.$transaction([
    prismaClient.vehicle.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: vehicleInclude,
    }),
    prismaClient.vehicle.count({ where }),
  ]);
  return { items: items.map(serializeVehicle), total, page: query.page, pageSize: query.pageSize };
};

export const approveVehicle = async (id: number, actorId: number, tagCode?: string) => {
  const current = await prismaClient.vehicle.findFirst({ where: { id, active: true } });
  if (!current) throw new AppError("VEHICLE_NOT_FOUND", "Vehículo no encontrado", 404);
  if (current.status !== VehicleStatus.APPROVED) await assertQuota(current.propertyId, id);
  const normalizedTag = tagCode ? normalizeTag(tagCode) : await generateTag();
  if (normalizedTag.length < 3) throw new AppError("VEHICLE_TAG_INVALID", "El tag no es válido", 400);
  const tagOwner = await prismaClient.vehicle.findUnique({ where: { tagCode: normalizedTag }, select: { id: true } });
  if (tagOwner && tagOwner.id !== id) throw new AppError("VEHICLE_TAG_DUPLICATE", "Ese tag ya está asignado", 409);

  const vehicle = await prismaClient.vehicle.update({
    where: { id },
    data: { status: VehicleStatus.APPROVED, tagCode: normalizedTag, approvedById: actorId, approvedAt: new Date(), notes: null },
    include: vehicleInclude,
  });
  return serializeVehicle(vehicle);
};

export const rejectVehicle = async (id: number, notes?: string) => {
  const current = await prismaClient.vehicle.findFirst({ where: { id, active: true } });
  if (!current) throw new AppError("VEHICLE_NOT_FOUND", "Vehículo no encontrado", 404);
  const vehicle = await prismaClient.vehicle.update({
    where: { id },
    data: { status: VehicleStatus.REJECTED, tagCode: null, approvedAt: null, approvedById: null, notes: trimOrNull(notes) },
    include: vehicleInclude,
  });
  return serializeVehicle(vehicle);
};

export const deactivateVehicle = async (id: number) => {
  const vehicle = await prismaClient.vehicle.findFirst({ where: { id, active: true } });
  if (!vehicle) throw new AppError("VEHICLE_NOT_FOUND", "Vehículo no encontrado", 404);
  await prismaClient.vehicle.update({ where: { id }, data: { active: false, status: VehicleStatus.INACTIVE, tagCode: null } });
  return { id };
};

export const lookupVehicles = async (query: string) => {
  const normalized = normalizePlate(query);
  const vehicles = await prismaClient.vehicle.findMany({
    where: {
      active: true,
      status: VehicleStatus.APPROVED,
      OR: [{ plateNormalized: { contains: normalized } }, { tagCode: { contains: normalizeTag(query) } }],
    },
    take: 10,
    include: vehicleInclude,
  });
  return vehicles.map(serializeVehicle);
};

export const registerVehicleAccess = async (id: number, direction: "ENTRY" | "EXIT", guardId: number) => {
  const vehicle = await prismaClient.vehicle.findFirst({ where: { id, active: true, status: VehicleStatus.APPROVED }, include: vehicleInclude });
  if (!vehicle) throw new AppError("VEHICLE_NOT_AVAILABLE", "El vehículo no está aprobado o está inactivo", 404);

  if (direction === "ENTRY") {
    const access = await getPropertyAccessStatus(vehicle.propertyId);
    if (access.blocked) {
      await recordAccessEvent({
        propertyId: vehicle.propertyId,
        vehicleId: vehicle.id,
        method: vehicle.tagCode ? AccessMethod.TAG : AccessMethod.MANUAL,
        direction: AccessDirection.ENTRY,
        decision: AccessDecision.DENIED,
        reason: access.reason,
        guardId,
        metadata: { plate: vehicle.plate, tagCode: vehicle.tagCode ?? undefined },
      });
      throw new AppError("ACCESS_BLOCKED_BY_DEBT", "La propiedad tiene adeudo. La administración debe autorizar el acceso.", 403);
    }
  }

  const event = await recordAccessEvent({
    propertyId: vehicle.propertyId,
    vehicleId: vehicle.id,
    method: vehicle.tagCode ? AccessMethod.TAG : AccessMethod.MANUAL,
    direction: direction === "ENTRY" ? AccessDirection.ENTRY : AccessDirection.EXIT,
    decision: AccessDecision.ALLOWED,
    reason: direction === "ENTRY" ? "VEHICLE_ENTRY" : "VEHICLE_EXIT",
    guardId,
    metadata: { plate: vehicle.plate, tagCode: vehicle.tagCode ?? undefined },
  });
  return { event, vehicle: serializeVehicle(vehicle) };
};
