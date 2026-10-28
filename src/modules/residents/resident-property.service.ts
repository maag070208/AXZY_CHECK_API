import { ResidentStatus } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";

/**
 * Propiedad canónica del residente: Person.userId → Resident(ACTIVE) → Property.
 * Es la misma regla que usan quejas, cargos y kardex. Devuelve null si no hay
 * vínculo activo con una propiedad vigente.
 */
export const findResidentPropertyId = async (userId: number): Promise<number | null> => {
  const resident = await prismaClient.resident.findFirst({
    where: { status: ResidentStatus.ACTIVE, person: { userId }, property: { softDelete: false } },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    select: { propertyId: true },
  });
  return resident?.propertyId ?? null;
};

/**
 * Respaldo para cuentas anteriores al vínculo Person → Resident: solo se acepta
 * si sigue siendo una cuenta RESDN activa y con propiedad asignada.
 */
export const findLegacyUserPropertyId = async (userId: number): Promise<number | null> => {
  const user = await prismaClient.user.findFirst({
    where: { id: userId, active: true, softDelete: false, role: { name: "RESDN" } },
    select: { propertyId: true },
  });
  return user?.propertyId ?? null;
};

/** Propiedad del residente con el vínculo canónico y, si no existe, el respaldo legado. */
export const findResidentOrLegacyPropertyId = async (userId: number): Promise<number | null> =>
  (await findResidentPropertyId(userId)) ?? (await findLegacyUserPropertyId(userId));

/** Igual que el anterior, pero falla con 400 cuando el residente no tiene propiedad. */
export const requireResidentPropertyId = async (userId: number): Promise<number> => {
  const propertyId = await findResidentOrLegacyPropertyId(userId);
  if (!propertyId) {
    throw new AppError("RESIDENT_WITHOUT_PROPERTY", "Tu cuenta no tiene una propiedad asignada", 400);
  }
  return propertyId;
};

/** ¿El usuario es residente activo de esa propiedad? Acepta también el respaldo legado. */
export const residentOwnsProperty = async (userId: number, propertyId: number): Promise<boolean> => {
  const linkedPropertyId = await findResidentPropertyId(userId);
  if (linkedPropertyId !== null) return linkedPropertyId === propertyId;
  return (await findLegacyUserPropertyId(userId)) === propertyId;
};
