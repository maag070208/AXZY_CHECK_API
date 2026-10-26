import { createHmac, randomInt } from "crypto";
import { AccessDecision, AccessDirection, AccessMethod } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { secretKey } from "@src/core/config/config";
import { AppError } from "@src/core/errors/app-error";
import { getPropertyAccessStatus, recordAccessEvent } from "../access-control/access-control.service";

const PIN_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<number, { failures: number; lockedUntil?: number }>();

/** Solo para pruebas: reinicia el contador en memoria. */
export const resetPinAttempts = () => attempts.clear();

const hashPin = (pin: string) => createHmac("sha256", secretKey).update(pin).digest("hex");

const propertyForResident = async (userId: number) => {
  const user = await prismaClient.user.findFirst({
    where: { id: userId, active: true, softDelete: false, role: { name: "RESDN" } },
    select: { propertyId: true },
  });
  if (!user?.propertyId) throw new AppError("RESIDENT_WITHOUT_PROPERTY", "Tu cuenta no tiene una propiedad asignada", 400);
  return user.propertyId;
};

const activePinFor = (userId: number) =>
  prismaClient.accessPin.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "desc" } });

export const getMyAccessPin = async (userId: number) => {
  const pin = await activePinFor(userId);
  if (!pin) return { active: false, createdAt: null, lastUsedAt: null };
  return { active: true, createdAt: pin.createdAt.toISOString(), lastUsedAt: pin.lastUsedAt?.toISOString() ?? null };
};

export const generateMyAccessPin = async (userId: number) => {
  const propertyId = await propertyForResident(userId);
  await prismaClient.accessPin.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date() },
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const pinHash = hashPin(pin);
    const exists = await prismaClient.accessPin.findUnique({ where: { pinHash }, select: { id: true } });
    if (exists) continue;
    const created = await prismaClient.accessPin.create({
      data: { propertyId, userId, pinHash, createdById: userId },
    });
    return { id: created.id, pin, createdAt: created.createdAt.toISOString() };
  }
  throw new AppError("PIN_GENERATION_FAILED", "No se pudo generar la clave; intenta de nuevo", 500);
};

export const revokeMyAccessPin = async (userId: number) => {
  await prismaClient.accessPin.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date() },
  });
  return { active: false };
};

const guardLock = (guardId: number) => {
  const state = attempts.get(guardId);
  if (!state?.lockedUntil) return null;
  if (state.lockedUntil <= Date.now()) {
    attempts.delete(guardId);
    return null;
  }
  return state.lockedUntil;
};

const registerFailure = (guardId: number) => {
  const current = attempts.get(guardId) ?? { failures: 0 };
  const failures = current.failures + 1;
  if (failures >= PIN_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCK_MS;
    attempts.set(guardId, { failures, lockedUntil });
    return lockedUntil;
  }
  attempts.set(guardId, { failures });
  return null;
};

export const validateAccessPin = async (pin: string, guardId: number) => {
  const lockedUntil = guardLock(guardId);
  if (lockedUntil) {
    throw new AppError("PIN_TOO_MANY_ATTEMPTS", "Demasiados intentos. Espera 15 minutos.", 423);
  }

  const record = await prismaClient.accessPin.findFirst({
    where: { pinHash: hashPin(pin), active: true },
    include: {
      property: { select: { id: true, identifier: true, name: true } },
      user: { select: { id: true, name: true, lastName: true } },
    },
  });

  if (!record) {
    const until = registerFailure(guardId);
    if (until) throw new AppError("PIN_TOO_MANY_ATTEMPTS", "Demasiados intentos. Espera 15 minutos.", 423);
    return { valid: false, reason: "INVALID_PIN" };
  }

  const access = await getPropertyAccessStatus(record.propertyId);
  if (access.blocked) {
    attempts.delete(guardId);
    await recordAccessEvent({
      propertyId: record.propertyId,
      method: AccessMethod.PIN,
      direction: AccessDirection.ENTRY,
      decision: AccessDecision.DENIED,
      reason: access.reason,
      guardId,
      metadata: { pinId: record.id, userId: record.userId, overdueDays: access.overdueDays },
    });
    return {
      valid: false,
      reason: "PROPERTY_DEBT",
      property: record.property,
      person: { firstName: record.user.name, lastName: record.user.lastName },
    };
  }

  attempts.delete(guardId);
  await prismaClient.accessPin.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  const person = await prismaClient.person.findFirst({ where: { userId: record.userId }, select: { id: true } });
  await recordAccessEvent({
    propertyId: record.propertyId,
    personId: person?.id ?? null,
    method: AccessMethod.PIN,
    direction: AccessDirection.ENTRY,
    decision: AccessDecision.ALLOWED,
    reason: "PIN_VALID",
    guardId,
    metadata: { pinId: record.id, userId: record.userId },
  });

  return {
    valid: true,
    property: record.property,
    person: { firstName: record.user.name, lastName: record.user.lastName },
  };
};
