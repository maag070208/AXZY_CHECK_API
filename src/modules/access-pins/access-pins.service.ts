import { createHmac, randomInt } from "crypto";
import jwt from "jsonwebtoken";
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

export const generateMyAccessPin = async (userId: number, requestedPin?: string) => {
  const propertyId = await propertyForResident(userId);

  const create = async (pin: string) => {
    const pinHash = hashPin(pin);
    const exists = await prismaClient.accessPin.findUnique({ where: { pinHash }, select: { id: true } });
    if (exists) return null;
    await prismaClient.accessPin.updateMany({
      where: { userId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    const created = await prismaClient.accessPin.create({
      data: { propertyId, userId, pinHash, createdById: userId },
    });
    return { id: created.id, pin, createdAt: created.createdAt.toISOString() };
  };

  if (requestedPin) {
    const created = await create(requestedPin);
    if (!created) {
      throw new AppError("PIN_IN_USE", "Esa clave ya está en uso. Elige otra de 6 dígitos.", 409);
    }
    return created;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const created = await create(pin);
    if (created) return created;
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

/** Pase QR personal: token firmado de 60 s, revocable. */
export const getMyQrPass = async (userId: number) => {
  const pass = await prismaClient.personalQrPass.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, lastUsedAt: true },
  });
  return {
    active: !!pass,
    createdAt: pass?.createdAt.toISOString() ?? null,
    lastUsedAt: pass?.lastUsedAt?.toISOString() ?? null,
    expiresIn: 60,
  };
};

const activeQrPass = async (userId: number) => {
  const propertyId = await propertyForResident(userId);
  const current = await prismaClient.personalQrPass.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (current && current.propertyId === propertyId) return current;
  if (current) {
    await prismaClient.personalQrPass.updateMany({
      where: { userId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
  }
  return prismaClient.personalQrPass.create({ data: { userId, propertyId } });
};

export const issueMyQrPass = async (userId: number) => {
  const pass = await activeQrPass(userId);
  const token = jwt.sign(
    { kind: "PERSONAL_QR", passId: pass.id, userId, propertyId: pass.propertyId },
    secretKey,
    { expiresIn: "60s" },
  );
  return { token, expiresIn: 60, expiresAt: new Date(Date.now() + 60_000).toISOString() };
};

export const revokeMyQrPass = async (userId: number) => {
  await prismaClient.personalQrPass.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date() },
  });
  return { active: false };
};

export const validatePersonalQrPass = async (token: string, guardId: number) => {
  let payload: { kind?: string; passId?: number; userId?: number; propertyId?: number };
  try {
    payload = jwt.verify(token, secretKey) as typeof payload;
  } catch (error) {
    const expired = (error as { name?: string }).name === "TokenExpiredError";
    return { valid: false, reason: expired ? "EXPIRED_QR" : "INVALID_QR" };
  }
  if (payload.kind !== "PERSONAL_QR" || !payload.passId) {
    return { valid: false, reason: "INVALID_QR" };
  }

  const pass = await prismaClient.personalQrPass.findFirst({
    where: { id: payload.passId, active: true, revokedAt: null },
    include: {
      property: { select: { id: true, identifier: true, name: true } },
      user: { select: { id: true, name: true, lastName: true, photoUrl: true, active: true, softDelete: true, propertyId: true } },
    },
  });
  if (!pass || !pass.user.active || pass.user.softDelete || pass.user.propertyId !== pass.propertyId) {
    return { valid: false, reason: "INVALID_QR" };
  }

  const access = await getPropertyAccessStatus(pass.propertyId);
  if (access.blocked) {
    await recordAccessEvent({
      propertyId: pass.propertyId,
      method: AccessMethod.QR,
      direction: AccessDirection.ENTRY,
      decision: AccessDecision.DENIED,
      reason: access.reason,
      guardId,
      metadata: { passId: pass.id, userId: pass.userId, passType: "PERSONAL_QR", overdueDays: access.overdueDays },
    });
    return {
      valid: false,
      reason: "PROPERTY_DEBT",
      property: pass.property,
      person: { firstName: pass.user.name, lastName: pass.user.lastName },
    };
  }

  const person = await prismaClient.person.findFirst({ where: { userId: pass.userId }, select: { id: true } });
  await prismaClient.personalQrPass.update({ where: { id: pass.id }, data: { lastUsedAt: new Date() } });
  await recordAccessEvent({
    propertyId: pass.propertyId,
    personId: person?.id ?? null,
    method: AccessMethod.QR,
    direction: AccessDirection.ENTRY,
    decision: AccessDecision.ALLOWED,
    reason: "PERSONAL_QR",
    guardId,
    metadata: { passId: pass.id, userId: pass.userId, passType: "PERSONAL_QR" },
  });
  return {
    valid: true,
    property: pass.property,
    person: {
      firstName: pass.user.name,
      lastName: pass.user.lastName,
      photoUrl: pass.user.photoUrl,
    },
  };
};
