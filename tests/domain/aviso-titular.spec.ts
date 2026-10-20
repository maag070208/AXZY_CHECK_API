/**
 * [A2] Aviso al titular cuando alguien pide entrar fuera de horario: notificación por el outbox
 * solo en NEEDS_APPROVAL, dirigida al titular con cuenta.
 */
import request from "supertest";
import { app } from "@src/app";
import { createResidentUser } from "@src/modules/residents/residents.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const pending = () => prisma.outboxEvent.findMany({ where: { type: "notification.send" } });

const setup = async (withHolderAccount: boolean) => {
  const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
  const guard = `Bearer ${tokenFor(await buildUser("GUARD"))}`;
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: { identifier: "AV-1", name: "Casa", mainStreet: "C", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  let holderUserId: number | null = null;
  if (withHolderAccount) {
    holderUserId = (await createResidentUser({ name: "Titular", username: "titular.av", password: "x", propertyId: property.id }, {})).id;
  } else {
    const owner = await prisma.person.create({ data: { firstName: "Sin cuenta" } });
    await prisma.resident.create({ data: { personId: owner.id, propertyId: property.id, kindId: (await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } })).id, isPrimary: true, startDate: new Date() } });
  }
  const person = await prisma.person.create({ data: { firstName: "Jardinero" } });
  const otherDay = (new Date().getUTCDay() + 1) % 7;
  await request(app)
    .post(`/api/v1/properties/${property.id}/authorizations`)
    .set("Authorization", admin)
    .send({ personId: person.id, days: [otherDay], startTime: "00:00", endTime: "23:59", validFrom: "2026-01-01" });
  const check = `/api/v1/authorizations/check?propertyId=${property.id}&personId=${person.id}`;
  return { guard, check, holderUserId };
};

describe("aviso al titular", () => {
  it("fuera de horario, el titular con cuenta recibe la solicitud de aprobación", async () => {
    const { guard, check, holderUserId } = await setup(true);
    const res = await request(app).get(check).set("Authorization", guard);
    expect(res.body.data.decision).toBe("NEEDS_APPROVAL");
    const events = await pending();
    expect(events).toHaveLength(1);
    expect((events[0].payload as any).userIds).toEqual([holderUserId]);
    expect((events[0].payload as any).data.kind).toBe("AUTHORIZATION_APPROVAL");
  });

  it("dentro de horario no se avisa a nadie", async () => {
    const { guard, check } = await setup(true);
    await prisma.propertyAuthorization.updateMany({ data: { days: [0, 1, 2, 3, 4, 5, 6].join(",") } });
    expect((await request(app).get(check).set("Authorization", guard)).body.data.decision).toBe("AUTHORIZED");
    expect(await pending()).toHaveLength(0);
  });

  it("si el hogar no tiene titular con cuenta, no hay a quién avisar", async () => {
    const { guard, check } = await setup(false);
    expect((await request(app).get(check).set("Authorization", guard)).body.data.decision).toBe("NEEDS_APPROVAL");
    expect(await pending()).toHaveLength(0);
  });
});

describe("copia al propietario en propiedad rentada", () => {
  it("con la propiedad rentada, el propietario con cuenta recibe copia de la solicitud", async () => {
    const { guard, check, holderUserId } = await setup(true);
    const property = await prisma.property.findFirstOrThrow({ where: { identifier: "AV-1" } });
    const rented = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "RENTED" } });
    const resdn = await prisma.role.findUniqueOrThrow({ where: { name: "RESDN" } });
    const ownerUser = await prisma.user.create({ data: { name: "Dueño", username: "dueno.av", password: "x", roleId: resdn.id } });
    const ownerPerson = await prisma.person.create({ data: { firstName: "Dueño", userId: ownerUser.id } });
    await prisma.property.update({ where: { id: property.id }, data: { occupancyStatusId: rented.id, ownerPersonId: ownerPerson.id } });

    await request(app).get(check).set("Authorization", guard);
    const events = await pending();
    expect(events).toHaveLength(1);
    expect((events[0].payload as any).userIds).toEqual(expect.arrayContaining([holderUserId, ownerUser.id]));
  });
});

describe("límite de un aviso por persona cada 15 minutos", () => {
  it("consultas repetidas de la misma persona generan un solo aviso; otra persona sí avisa", async () => {
    const { guard, check, holderUserId } = await setup(true);
    await request(app).get(check).set("Authorization", guard);
    await request(app).get(check).set("Authorization", guard);
    expect(await pending()).toHaveLength(1);

    // Otra persona de la misma propiedad, con su propia autorización fuera de horario.
    const property = await prisma.property.findFirstOrThrow({ where: { identifier: "AV-1" } });
    const other = await prisma.person.create({ data: { firstName: "Plomero" } });
    await prisma.propertyAuthorization.create({
      data: { propertyId: property.id, personId: other.id, days: String((new Date().getUTCDay() + 1) % 7), startTime: "00:00", endTime: "23:59", validFrom: new Date("2026-01-01") },
    });
    await request(app).get(`/api/v1/authorizations/check?propertyId=${property.id}&personId=${other.id}`).set("Authorization", guard);
    expect(await pending()).toHaveLength(2);
    expect((await pending())[0].payload).toMatchObject({ userIds: [holderUserId] });
  });

  it("pasada la ventana de 15 minutos vuelve a avisar", async () => {
    const { guard, check } = await setup(true);
    await request(app).get(check).set("Authorization", guard);
    await prisma.outboxEvent.updateMany({ data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
    await request(app).get(check).set("Authorization", guard);
    expect(await pending()).toHaveLength(2);
  });
});
