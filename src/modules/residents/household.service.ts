import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { getSetting } from "@src/core/settings/app-settings.service";
import { recountResidents } from "@src/modules/properties/resident-count";
import { todayDateOnly } from "@src/modules/properties/occupancy.service";
import { syncLegacyResident } from "./legacy-sync";

type Tx = Prisma.TransactionClient;

/** Personas que coinciden por teléfono, correo o nombre (T-A2-05). Advierte antes de crear otra. */
export const findDuplicates = (tx: Tx, input: { firstName: string; lastName?: string | null; phone?: string | null; email?: string | null }) => {
  const or: Prisma.PersonWhereInput[] = [];
  if (input.phone) or.push({ phone: input.phone });
  if (input.email) or.push({ email: { equals: input.email, mode: "insensitive" } });
  if (input.lastName) {
    or.push({
      firstName: { equals: input.firstName, mode: "insensitive" },
      lastName: { equals: input.lastName, mode: "insensitive" },
    });
  }
  if (or.length === 0) return Promise.resolve([]);
  return tx.person.findMany({ where: { OR: or }, take: 5, select: { id: true, firstName: true, lastName: true, phone: true, email: true } });
};

/** Edad en años cumplidos a la fecha dada. */
const ageOn = (birthDate: Date, on: Date) => {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age--;
  return age;
};

export const listHousehold = (propertyId: number) =>
  prismaClient.resident.findMany({
    where: { propertyId, status: "ACTIVE" },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    include: {
      person: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, birthDate: true, userId: true } },
      kind: true,
    },
  });

export const addHouseholdResident = async (
  propertyId: number,
  input: {
    personId?: number | null;
    firstName?: string;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    kindCode: string;
    isPrimary?: boolean;
    canAuthorizeVisits?: boolean;
    hasAppAccess?: boolean;
    confirmNewPerson?: boolean;
  },
) => {
  const today = await todayDateOnly();
  const minAge = Number(await getSetting("resident.minAgeForAccount", "18")) || 18;

  return prismaClient.$transaction(async (tx) => {
    const property = await tx.property.findUnique({ where: { id: propertyId }, select: { id: true, softDelete: true } });
    if (!property || property.softDelete) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);

    const kind = await tx.residentKind.findUnique({ where: { code: input.kindCode } });
    if (!kind || !kind.active) throw new AppError("RESIDENT_KIND_INVALID", "Tipo de residente no válido", 400);

    let person;
    if (input.personId) {
      person = await tx.person.findUnique({ where: { id: input.personId } });
      if (!person) throw new AppError("PERSON_NOT_FOUND", "Persona no encontrada", 404);
    } else {
      if (!input.firstName) throw new AppError("PERSON_REQUIRED", "Indica la persona o su nombre", 400);
      const duplicates = await findDuplicates(tx, {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
      });
      if (duplicates.length > 0 && !input.confirmNewPerson) {
        throw new AppError("DUPLICATE_PERSON", "Ya existe una persona con estos datos; confirma para crear otra", 409);
      }
      person = await tx.person.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
        },
      });
    }

    const hasAppAccess = Boolean(input.hasAppAccess ?? kind.hasAppAccess);
    if (hasAppAccess && person.birthDate && ageOn(person.birthDate, today) < minAge) {
      throw new AppError("RESIDENT_MINOR_NO_ACCOUNT", "Una persona menor de edad no puede tener cuenta de APP", 400);
    }

    const existing = await tx.resident.findFirst({
      where: { personId: person.id, propertyId, status: "ACTIVE" },
    });
    if (existing) throw new AppError("RESIDENT_ALREADY_LINKED", "La persona ya es residente activa de esta propiedad", 409);

    const hasPrimary = (await tx.resident.count({ where: { propertyId, status: "ACTIVE", isPrimary: true } })) > 0;
    const isPrimary = Boolean(input.isPrimary) || (!hasPrimary && kind.isHouseholdMember);
    if (isPrimary) {
      await tx.resident.updateMany({ where: { propertyId, status: "ACTIVE", isPrimary: true }, data: { isPrimary: false } });
    }

    const resident = await tx.resident.create({
      data: {
        personId: person.id,
        propertyId,
        kindId: kind.id,
        isPrimary,
        canAuthorizeVisits: Boolean(input.canAuthorizeVisits ?? kind.canAuthorizeVisits),
        hasAppAccess,
        startDate: today,
      },
      include: { person: true, kind: true },
    });
    await recountResidents([propertyId], tx);
    return resident;
  });
};

/** Titular único por propiedad, en transacción (T-A2-02). */
export const setPrimary = async (residentId: number) =>
  prismaClient.$transaction(async (tx) => {
    const target = await tx.resident.findUnique({ where: { id: residentId }, include: { kind: true } });
    if (!target || target.status !== "ACTIVE") throw new AppError("RESIDENT_NOT_ACTIVE", "El residente no está activo", 409);
    if (!target.kind.isHouseholdMember) throw new AppError("RESIDENT_NOT_HOUSEHOLD", "Solo un miembro del hogar puede ser titular", 400);

    await tx.resident.updateMany({
      where: { propertyId: target.propertyId, status: "ACTIVE", isPrimary: true, NOT: { id: residentId } },
      data: { isPrimary: false },
    });
    return tx.resident.update({ where: { id: residentId }, data: { isPrimary: true } });
  });

/**
 * Mudanza (T-A2-04/T-A2-T4): cierra el vínculo, conserva historial. Si era titular, con
 * `replacementPrimaryId` se designa otro; si no, la respuesta trae la advertencia
 * PROPERTY_WITHOUT_PRIMARY. Si la persona tiene cuenta, se quita la propiedad al usuario.
 */
export const moveOut = async (residentId: number, input: { replacementPrimaryId?: number | null }) => {
  const today = await todayDateOnly();
  return prismaClient.$transaction(async (tx) => {
    const resident = await tx.resident.findUnique({ where: { id: residentId }, include: { person: true } });
    if (!resident || resident.status !== "ACTIVE") throw new AppError("RESIDENT_NOT_ACTIVE", "El residente no está activo", 409);

    await tx.resident.update({
      where: { id: residentId },
      data: { status: "MOVED_OUT", endDate: today, isPrimary: false },
    });

    if (resident.person.userId) {
      await tx.user.update({ where: { id: resident.person.userId }, data: { propertyId: null } });
      await syncLegacyResident(tx, resident.person.userId);
    }

    let warning: string | null = null;
    if (resident.isPrimary) {
      if (input.replacementPrimaryId) {
        const replacement = await tx.resident.findUnique({ where: { id: input.replacementPrimaryId } });
        if (!replacement || replacement.status !== "ACTIVE" || replacement.propertyId !== resident.propertyId) {
          throw new AppError("REPLACEMENT_INVALID", "El nuevo titular debe ser residente activo de la propiedad", 400);
        }
        await tx.resident.update({ where: { id: replacement.id }, data: { isPrimary: true } });
      } else {
        warning = "PROPERTY_WITHOUT_PRIMARY";
      }
    }

    await recountResidents([resident.propertyId], tx);
    return { residentId, propertyId: resident.propertyId, warning };
  });
};
