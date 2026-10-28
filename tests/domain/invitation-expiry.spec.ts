/**
 * Job de pases vencidos: marca EXPIRED solo los PENDING y avisa a quien los creó.
 */
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";
import { expirePendingInvitations } from "@src/modules/invitations/invitations.service";
import { processOutbox } from "@src/core/outbox/outbox";

const HOUR = 60 * 60 * 1000;

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const makeProperty = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const occupancy = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: occupancy.id },
  });
};

const makeInvitation = async (propertyId: number, createdById: number, code: string, validUntil: Date) => {
  const type = await prisma.invitationType.findFirstOrThrow({ where: { name: "VISITOR" } });
  return prisma.invitation.create({
    data: {
      code,
      guestName: `Visita ${code}`,
      createdById,
      propertyId,
      typeId: type.id,
      validFrom: new Date(Date.now() - 2 * HOUR),
      validUntil,
    },
  });
};

describe("expiración de pases", () => {
  it("marca EXPIRED los pendientes vencidos y notifica al creador", async () => {
    const user = await buildUser("RESDN");
    const property = await makeProperty("EXP-1");
    const expired = await makeInvitation(property.id, user.id, "AXZ-EXP001", new Date(Date.now() - HOUR));
    const valid = await makeInvitation(property.id, user.id, "AXZ-VAL001", new Date(Date.now() + HOUR));

    const count = await expirePendingInvitations(new Date());
    expect(count).toBe(1);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("EXPIRED");
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: valid.id } })).status).toBe("PENDING");

    await processOutbox(new Date());
    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(notification.title).toBe("Pase vencido");
    expect(notification.body).toContain("Visita AXZ-EXP001");
    expect(notification.data).toMatchObject({ type: "INVITATION_EXPIRED", invitationId: String(expired.id) });
  });

  it("es idempotente y no vence pases que ya entraron", async () => {
    const user = await buildUser("RESDN");
    const property = await makeProperty("EXP-2");
    const expired = await makeInvitation(property.id, user.id, "AXZ-EXP002", new Date(Date.now() - HOUR));
    const entered = await makeInvitation(property.id, user.id, "AXZ-ENT002", new Date(Date.now() - HOUR));
    await prisma.invitation.update({ where: { id: entered.id }, data: { status: "ENTERED", entryTime: new Date(Date.now() - 2 * HOUR) } });

    expect(await expirePendingInvitations(new Date())).toBe(1);
    expect(await expirePendingInvitations(new Date())).toBe(0);
    await processOutbox(new Date());
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("EXPIRED");
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: entered.id } })).status).toBe("ENTERED");
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);
  });
});
