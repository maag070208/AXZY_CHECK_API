import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { hashPassword } from "@src/core/utils/security";
import { getSetting } from "@src/core/settings/app-settings.service";
import { todayDateOnly } from "@src/modules/properties/occupancy.service";
import { syncLegacyResident } from "@src/modules/residents/legacy-sync";

const ageOn = (birthDate: Date, on: Date) => {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const before =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (before) age--;
  return age;
};

/**
 * Crea la cuenta de APP de una persona que es residente activa de una propiedad (T-A2-06).
 * El usuario es RESDN, queda vinculado a la persona y a la propiedad, y el vínculo marca acceso a la APP.
 * Un menor no puede tener cuenta (T-A2-T5).
 */
export const createResidentAccount = async (personId: number, input: { username: string; password: string }) => {
  const person = await prismaClient.person.findUnique({ where: { id: personId } });
  if (!person) throw new AppError("PERSON_NOT_FOUND", "Persona no encontrada", 404);
  if (person.userId) throw new AppError("ACCOUNT_EXISTS", "La persona ya tiene cuenta de APP", 409);

  const minAge = Number(await getSetting("resident.minAgeForAccount", "18")) || 18;
  if (person.birthDate && ageOn(person.birthDate, await todayDateOnly()) < minAge) {
    throw new AppError("RESIDENT_MINOR_NO_ACCOUNT", "Una persona menor de edad no puede tener cuenta de APP", 400);
  }

  const link = await prismaClient.resident.findFirst({
    where: { personId, status: "ACTIVE" },
    orderBy: { id: "asc" },
  });
  if (!link) throw new AppError("RESIDENT_NOT_ACTIVE", "La persona necesita un vínculo activo con una propiedad", 409);

  const taken = await prismaClient.user.findUnique({ where: { username: input.username } });
  if (taken) throw new AppError("USERNAME_TAKEN", "El nombre de usuario ya está registrado", 409);

  const role = await prismaClient.role.findUniqueOrThrow({ where: { name: "RESDN" } });
  const password = await hashPassword(input.password);

  return prismaClient.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: person.firstName,
        lastName: person.lastName,
        username: input.username,
        password,
        roleId: role.id,
        propertyId: link.propertyId,
      },
    });
    await tx.person.update({ where: { id: person.id }, data: { userId: user.id } });
    await tx.resident.update({ where: { id: link.id }, data: { hasAppAccess: true } });
    await syncLegacyResident(tx, user.id);
    return { userId: user.id, username: user.username, propertyId: link.propertyId };
  });
};
