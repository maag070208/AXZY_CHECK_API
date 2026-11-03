import { createHmac, randomBytes, randomInt } from "crypto";
import { AccessDecision, AccessDirection, AccessMethod } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { secretKey } from "@src/core/config/config";
import { AppError } from "@src/core/errors/app-error";
import { getPropertyAccessStatus, recordAccessEvent } from "../access-control/access-control.service";
import { findResidentPropertyId, requireResidentPropertyId } from "../residents/resident-property.service";
import { ClientScope, scopeByClient, scopeByProperty } from "@src/core/scope/client-scope";

const PIN_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<number, { failures: number; lockedUntil?: number }>();

/** Solo para pruebas: reinicia el contador en memoria. */
export const resetPinAttempts = () => attempts.clear();

const hashPin = (pin: string) => createHmac("sha256", secretKey).update(pin).digest("hex");

const propertyForResident = async (userId: number) => requireResidentPropertyId(userId);

/**
 * Propiedad y cliente del residente que escribe un PIN: el vínculo Person → Resident manda sobre
 * `User.propertyId` (como en el resto del módulo) y, si el token trae cliente, la propiedad debe ser de ese
 * cliente. El PIN se etiqueta siempre con el cliente de la propiedad (fase 5).
 */
const residentPropertyInScope = async (userId: number, scope: ClientScope | undefined) => {
  const propertyId = await propertyForResident(userId);
  const property = await prismaClient.property.findFirst({
    where: { id: propertyId, ...(scope?.clientId ? scopeByClient(scope) : {}) },
    select: { id: true, clientId: true },
  });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
  return { propertyId: property.id, clientId: property.clientId };
};

const activePinFor = (userId: number) =>
  prismaClient.accessPin.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "desc" } });

export const getMyAccessPin = async (userId: number) => {
  const pin = await activePinFor(userId);
  if (!pin) return { active: false, createdAt: null, lastUsedAt: null };
  return { active: true, createdAt: pin.createdAt.toISOString(), lastUsedAt: pin.lastUsedAt?.toISOString() ?? null };
};

export const generateMyAccessPin = async (userId: number, requestedPin?: string, scope?: ClientScope) => {
  const { propertyId, clientId } = await residentPropertyInScope(userId, scope);
  if (clientId === null) {
    // Fase 5: el PIN siempre se guarda con su cliente; sin cliente no se puede garantizar el aislamiento.
    throw new AppError("CLIENT_SCOPE_REQUIRED", "No hay un cliente asignado o seleccionado", 403);
  }

  const create = async (pin: string) => {
    const pinHash = hashPin(pin);
    // Único POR CLIENTE: el mismo PIN puede existir en dos clientes distintos.
    const exists = await prismaClient.accessPin.findFirst({ where: { pinHash, clientId }, select: { id: true } });
    if (exists) return null;
    await prismaClient.accessPin.updateMany({
      where: { userId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    const created = await prismaClient.accessPin.create({
      data: { propertyId, userId, pinHash, clientId, createdById: userId },
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

export const validateAccessPin = async (pin: string, guardId: number, scope: ClientScope | undefined) => {
  const lockedUntil = guardLock(guardId);
  if (lockedUntil) {
    throw new AppError("PIN_TOO_MANY_ATTEMPTS", "Demasiados intentos. Espera 15 minutos.", 423);
  }

  // Solo claves del cliente del guardia: una clave de otro cliente se comporta como inexistente.
  const record = await prismaClient.accessPin.findFirst({
    where: { pinHash: hashPin(pin), active: true, ...scopeByClient(scope) },
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
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      property: { select: { id: true, identifier: true, name: true } },
      user: { select: { name: true, lastName: true } },
    },
  });
  return {
    active: !!pass,
    createdAt: pass?.createdAt.toISOString() ?? null,
    lastUsedAt: pass?.lastUsedAt?.toISOString() ?? null,
    property: pass?.property ?? null,
    person: pass ? { firstName: pass.user.name, lastName: pass.user.lastName } : null,
    expiresIn: 60,
  };
};

const activeQrPass = async (userId: number, scope?: ClientScope) => {
  // El pase QR personal sigue colgando de la propiedad (no lleva clientId propio en la fase 5).
  const { propertyId } = await residentPropertyInScope(userId, scope);
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

export const issueMyQrPass = async (userId: number, scope?: ClientScope) => {
  const pass = await activeQrPass(userId, scope);
  let code = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    code = `AXZ-P-${randomBytes(3).toString("hex").toUpperCase()}`;
    const codeHash = hashPin(code);
    const exists = await prismaClient.personalQrPass.findUnique({ where: { codeHash }, select: { id: true } });
    if (!exists) {
      await prismaClient.personalQrPass.update({
        where: { id: pass.id },
        data: { codeHash, codeExpiresAt: new Date(Date.now() + 60_000) },
      });
      return { token: code, expiresIn: 60, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    }
  }
  throw new AppError("QR_GENERATION_FAILED", "No se pudo generar el pase QR; intenta de nuevo", 500);
};

export const revokeMyQrPass = async (userId: number) => {
  await prismaClient.personalQrPass.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date(), codeHash: null, codeExpiresAt: null },
  });
  return { active: false };
};

export const validatePersonalQrPass = async (token: string, guardId: number, scope: ClientScope | undefined) => {
  const codeHash = hashPin(token);
  // Solo pases de residentes del cliente del guardia: un pase de otro cliente se comporta como desconocido.
  const pass = await prismaClient.personalQrPass.findFirst({
    where: { codeHash, active: true, revokedAt: null, codeExpiresAt: { gt: new Date() }, ...scopeByProperty(scope) },
    include: {
      property: { select: { id: true, identifier: true, name: true } },
      user: { select: { id: true, name: true, lastName: true, photoUrl: true, active: true, softDelete: true, propertyId: true } },
    },
  });
  if (!pass) {
    const stale = await prismaClient.personalQrPass.findFirst({ where: { codeHash, ...scopeByProperty(scope) }, select: { id: true } });
    return { valid: false, reason: stale ? "EXPIRED_QR" : "INVALID_QR" };
  }
  const linkedPropertyId = await findResidentPropertyId(pass.userId);
  const hasAccessToProperty = linkedPropertyId !== null
    ? linkedPropertyId === pass.propertyId
    : pass.user.propertyId === pass.propertyId;
  if (!pass.user.active || pass.user.softDelete || !hasAccessToProperty) {
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
