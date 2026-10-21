import { PrismaClient } from "@prisma/client";
import { PropertyIds } from "./properties";
import { StaffIds } from "./staff";

export interface AccessIds {
  invitationIds: Record<"PENDING" | "ENTERED" | "EXITED" | "CANCELLED", number>;
  authorizedPersonId: number;
  authorizationId: number;
}

const hours = (h: number) => new Date(Date.now() + h * 3600_000);

/**
 * Flujo "accesos": una invitación en cada estado para la casa del residente y una persona
 * autorizada (empleada doméstica) con horario de lunes a viernes. Códigos fijos FLUJO-INV-*.
 */
export const accessFlow = async (prisma: PrismaClient, staff: StaffIds, props: PropertyIds): Promise<AccessIds> => {
  const visitor = await prisma.invitationType.findUniqueOrThrow({ where: { name: "VISITOR" } });
  const states = {
    PENDING: { validFrom: hours(-1), validUntil: hours(24) },
    ENTERED: { validFrom: hours(-3), validUntil: hours(24), entryTime: hours(-1) },
    EXITED: { validFrom: hours(-26), validUntil: hours(24), entryTime: hours(-25), exitTime: hours(-23) },
    CANCELLED: { validFrom: hours(2), validUntil: hours(26) },
  } as const;

  const invitationIds = {} as AccessIds["invitationIds"];
  for (const [status, dates] of Object.entries(states) as [keyof typeof states, (typeof states)[keyof typeof states]][]) {
    const code = `FLUJO-INV-${status}`;
    const row = await prisma.invitation.upsert({
      where: { code },
      update: {},
      create: { code, guestName: `Invitado ${status.toLowerCase()}`, createdById: staff.resident, propertyId: props.houseId, typeId: visitor.id, status, ...dates },
    });
    invitationIds[status] = row.id;
  }

  const domestic =
    (await prisma.person.findFirst({ where: { email: "dora.domestica@example.test" } })) ??
    (await prisma.person.create({ data: { firstName: "Dora", lastName: "Doméstica", phone: "5550103", email: "dora.domestica@example.test" } }));
  const authorization =
    (await prisma.propertyAuthorization.findFirst({ where: { propertyId: props.houseId, personId: domestic.id } })) ??
    (await prisma.propertyAuthorization.create({
      data: {
        propertyId: props.houseId, personId: domestic.id, scope: "PEDESTRIAN", days: "1,2,3,4,5",
        startTime: "08:00", endTime: "18:00", validFrom: new Date("2026-01-01T00:00:00.000Z"), createdById: staff.admin,
      },
    }));

  return { invitationIds, authorizedPersonId: domestic.id, authorizationId: authorization.id };
};
