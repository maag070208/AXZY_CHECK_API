import { Prisma } from "@prisma/client";
import { recountResidents } from "@src/modules/properties/resident-count";
import { todayDateOnly } from "@src/modules/properties/occupancy.service";

type Tx = Prisma.TransactionClient;

/**
 * Puente de doble escritura (A2). Las rutas anteriores de residentes siguen escribiendo
 * User.propertyId / User.active. Esta función deja la tabla Resident igual que el usuario:
 * un residente activo en su propiedad, o ninguno si el usuario está inactivo o sin propiedad.
 * Se llama dentro de la misma transacción que la escritura del usuario.
 */
export const syncLegacyResident = async (tx: Tx, userId: number) => {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      lastName: true,
      active: true,
      propertyId: true,
      role: { select: { name: true } },
      residentProfile: { select: { phoneNumber: true, email: true } },
    },
  });
  if (!user) return;

  const person = await tx.person.findUnique({ where: { userId } });
  const today = await todayDateOnly();

  // Vínculos activos actuales de esta persona (puede haber varios si se editó la propiedad).
  const activeLinks = person
    ? await tx.resident.findMany({ where: { personId: person.id, status: "ACTIVE" } })
    : [];
  const affected = new Set<number>(activeLinks.map((link) => link.propertyId));

  // Ser miembro del hogar depende de la propiedad, no de la cuenta. Una cuenta desactivada
  // conserva el vínculo y solo pierde el acceso a la APP (decisión del 2026-10-20).
  const shouldBeResident = user.role?.name === "RESDN" && user.propertyId !== null;

  // Cerrar los vínculos que ya no corresponden.
  for (const link of activeLinks) {
    if (!shouldBeResident || link.propertyId !== user.propertyId) {
      await tx.resident.update({
        where: { id: link.id },
        data: { status: "MOVED_OUT", endDate: today, isPrimary: false },
      });
    }
  }

  // El acceso a la APP sigue a la cuenta activa.
  if (shouldBeResident) {
    await tx.resident.updateMany({
      where: { personId: person?.id ?? -1, propertyId: user.propertyId!, status: "ACTIVE" },
      data: { hasAppAccess: user.active },
    });
  }

  if (shouldBeResident && user.propertyId !== null) {
    const stillLinked = activeLinks.some((link) => link.propertyId === user.propertyId);
    if (!stillLinked) {
      const owner = await tx.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
      const newPerson =
        person ??
        (await tx.person.create({
          data: {
            firstName: user.name,
            lastName: user.lastName,
            phone: user.residentProfile?.phoneNumber ?? null,
            email: user.residentProfile?.email ?? null,
            userId,
          },
        }));
      const hasPrimary = await tx.resident.count({
        where: { propertyId: user.propertyId, status: "ACTIVE", isPrimary: true },
      });
      await tx.resident.create({
        data: {
          personId: newPerson.id,
          propertyId: user.propertyId,
          kindId: owner.id,
          isPrimary: hasPrimary === 0,
          canAuthorizeVisits: true,
          hasAppAccess: user.active,
          startDate: today,
        },
      });
      affected.add(user.propertyId);
    }
  }

  await recountResidents([...affected, user.propertyId], tx);
};

/** Cierra todos los vínculos activos de un usuario antes de borrarlo. */
export const closeResidentsOfUser = async (tx: Tx, userId: number) => {
  const person = await tx.person.findUnique({ where: { userId } });
  if (!person) return;
  const today = await todayDateOnly();
  const links = await tx.resident.findMany({ where: { personId: person.id, status: "ACTIVE" } });
  await tx.resident.updateMany({
    where: { personId: person.id, status: "ACTIVE" },
    data: { status: "MOVED_OUT", endDate: today, isPrimary: false },
  });
  await recountResidents(links.map((link) => link.propertyId), tx);
};
