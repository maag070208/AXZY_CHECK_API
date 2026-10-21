import { PrismaClient } from "@prisma/client";
import { recountResidents } from "@src/modules/properties/resident-count";
import { FLOW_BUILDING, FLOW_PROPERTIES } from "./constants";
import { StaffIds } from "./staff";

export interface PropertyIds {
  buildingId: number;
  houseId: number;
  apartmentId: number;
  vacantId: number;
  ownerPersonId: number;
  tenantPersonId: number;
  residentPersonId: number;
  primaryResidentId: number;
}

const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

const ensurePerson = async (prisma: PrismaClient, data: { firstName: string; lastName: string; phone: string; email: string; userId?: number }) => {
  const found = await prisma.person.findFirst({ where: { email: data.email } });
  return found ?? prisma.person.create({ data });
};

/**
 * Flujo "propiedades y residentes": un edificio; una casa habitada por su propietario
 * (con la cuenta de residente como titular), un departamento rentado y una casa vacía.
 * Cada propiedad nace con su periodo de ocupación vigente. Idempotente por identificador.
 */
export const propertiesFlow = async (prisma: PrismaClient, staff: StaffIds): Promise<PropertyIds> => {
  const [kindHouse, kindApartment] = await Promise.all([
    prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } }),
    prisma.propertyKind.findUniqueOrThrow({ where: { code: "APARTMENT" } }),
  ]);
  const [vacant, ownerOccupied, rented] = await Promise.all(
    ["VACANT", "OWNER_OCCUPIED", "RENTED"].map((code) => prisma.occupancyStatus.findUniqueOrThrow({ where: { code } })),
  );
  const [legacyHouse, legacyApartment] = await Promise.all(
    ["CASA", "DEPA"].map((name) => prisma.propertyType.findUniqueOrThrow({ where: { name } })),
  );
  const [legacyVacant, legacyInhabited] = await Promise.all(
    ["VACNT", "HABIT"].map((name) => prisma.propertyStatus.findUniqueOrThrow({ where: { name } })),
  );
  const ownerKind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });

  const building = await prisma.building.upsert({ where: { name: FLOW_BUILDING }, update: {}, create: { name: FLOW_BUILDING, floors: 4 } });

  const owner = await ensurePerson(prisma, { firstName: "Oscar", lastName: "Propietario", phone: "5550100", email: "oscar.propietario@example.test" });
  const tenant = await ensurePerson(prisma, { firstName: "Tania", lastName: "Inquilina", phone: "5550101", email: "tania.inquilina@example.test" });
  const residentPerson = await ensurePerson(prisma, { firstName: "Rosa", lastName: "Residente", phone: "5550102", email: "rosa.residente@example.test", userId: staff.resident });

  const ensureProperty = async (
    def: { identifier: string; name: string; mainStreet: string },
    extra: { kindId: number; typeId: number; statusId: number; occupancyStatusId: number; buildingId?: number; ownerPersonId?: number; unitNumber?: string; floor?: number },
  ) => {
    const existing = await prisma.property.findUnique({ where: { identifier: def.identifier } });
    if (existing) return existing;
    const created = await prisma.property.create({ data: { ...def, maxResidents: 4, ...extra } });
    await prisma.occupancyPeriod.create({
      data: {
        propertyId: created.id,
        statusId: extra.occupancyStatusId,
        startDate: today(),
        ownerPersonId: extra.ownerPersonId ?? null,
        tenantPersonId: extra.occupancyStatusId === rented.id ? tenant.id : null,
      },
    });
    return created;
  };

  const house = await ensureProperty(FLOW_PROPERTIES.house, {
    kindId: kindHouse.id, typeId: legacyHouse.id, statusId: legacyInhabited.id, occupancyStatusId: ownerOccupied.id, ownerPersonId: owner.id,
  });
  const apartment = await ensureProperty(FLOW_PROPERTIES.apartment, {
    kindId: kindApartment.id, typeId: legacyApartment.id, statusId: legacyInhabited.id, occupancyStatusId: rented.id,
    buildingId: building.id, ownerPersonId: owner.id, unitNumber: "101", floor: 1,
  });
  const vacantHouse = await ensureProperty(FLOW_PROPERTIES.vacant, {
    kindId: kindHouse.id, typeId: legacyHouse.id, statusId: legacyVacant.id, occupancyStatusId: vacant.id,
  });

  // La cuenta de residente vive en la casa y es la titular del hogar.
  await prisma.user.update({ where: { id: staff.resident }, data: { propertyId: house.id } });
  let primary = await prisma.resident.findFirst({ where: { personId: residentPerson.id, propertyId: house.id, status: "ACTIVE" } });
  if (!primary) {
    primary = await prisma.resident.create({
      data: {
        personId: residentPerson.id, propertyId: house.id, kindId: ownerKind.id, isPrimary: true,
        canAuthorizeVisits: true, hasAppAccess: true, startDate: today(),
      },
    });
  }
  await recountResidents([house.id, apartment.id, vacantHouse.id], prisma);

  const hasContact = await prisma.personContact.findFirst({ where: { personId: residentPerson.id } });
  if (!hasContact) {
    await prisma.personContact.create({ data: { personId: residentPerson.id, name: "Elena Emergencias", phone: "5550199", relationship: "Hermano(a)" } });
  }

  return {
    buildingId: building.id, houseId: house.id, apartmentId: apartment.id, vacantId: vacantHouse.id,
    ownerPersonId: owner.id, tenantPersonId: tenant.id, residentPersonId: residentPerson.id, primaryResidentId: primary.id,
  };
};
