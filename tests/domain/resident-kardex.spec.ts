/**
 * Módulo 13 fase 5: kardex del residente. Une accesos de invitados, incidencias
 * de su propiedad, cargos y pagos; filtra por propiedad/residente en servidor.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const api = "/api/v1";
const kardexUrl = `${api}/residents/me/kardex`;
const DAY = 24 * 60 * 60 * 1000;

const makeProperty = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  await prisma.occupancyPeriod.create({ data: { propertyId: property.id, statusId: vacant.id, startDate: new Date() } });
  return property;
};

const makeResident = async (propertyId: number | null) => {
  const user = await buildUser("RESDN");
  if (propertyId !== null) {
    const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
    const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
    await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  }
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const makeInvitation = async (propertyId: number, userId: number, entryTime: Date, exitTime: Date | null, code: string) => {
  const type = await prisma.invitationType.findFirstOrThrow({ where: { name: "VISITOR" } });
  return prisma.invitation.create({
    data: {
      code,
      guestName: `Invitado ${code}`,
      createdById: userId,
      propertyId,
      validFrom: entryTime,
      validUntil: exitTime ?? entryTime,
      entryTime,
      exitTime,
      typeId: type.id,
    },
  });
};

const makeIncident = async (propertyId: number, guardId: number, title: string, createdAt: Date) => {
  return prisma.incident.create({
    data: { guardId, propertyId, title, description: "Detalle interno", status: "PENDING", createdAt },
  });
};

const adminAuth = async () => {
  const admin = await buildUser("ADMIN");
  return { admin, auth: `Bearer ${tokenFor(admin)}` };
};

const createCharge = async (auth: string, propertyId: number, residentId: number, amount: number) => {
  const res = await request(app).post(`${api}/charges`).set("Authorization", auth).send({
    propertyId,
    residentId,
    concept: `Cargo ${amount}`,
    category: "EXTRA",
    amount,
    dueDate: "2026-11-10",
  });
  return res.body.data as { id: number };
};

const createPayment = async (auth: string, propertyId: number, residentId: number, amount: number) => {
  const res = await request(app).post(`${api}/payments`).set("Authorization", auth).send({
    propertyId,
    residentId,
    amount,
    method: "EFECTIVO",
    reference: `REC-${amount}`,
    paidAt: new Date().toISOString().slice(0, 10),
  });
  return res.body.data as { id: number };
};

describe("kardex del residente", () => {
  it("une accesos, incidencias, cargos y pagos de la propiedad del residente", async () => {
    const property = await makeProperty("K-1");
    const resident = await makeResident(property.id);
    const { admin, auth } = await adminAuth();

    const entry = new Date(Date.now() - 2 * DAY);
    const exit = new Date(Date.now() - 1 * DAY);
    await makeInvitation(property.id, resident.user.id, entry, exit, "K-ACC");
    await makeIncident(property.id, admin.id, "Fuga de agua", new Date(Date.now() - 3 * DAY));
    await createCharge(auth, property.id, resident.user.id, 100);
    await createPayment(auth, property.id, resident.user.id, 100);

    const res = await request(app).get(kardexUrl).set("Authorization", resident.auth);
    expect(res.status).toBe(200);
    const types = res.body.data.items.map((item: { type: string }) => item.type);
    expect(types).toEqual(expect.arrayContaining(["ACCESS_ENTRY", "ACCESS_EXIT", "INCIDENT", "CHARGE", "PAYMENT"]));
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.propertyId).toBe(property.id);

    const incident = res.body.data.items.find((item: { type: string }) => item.type === "INCIDENT");
    expect(incident).toMatchObject({ title: "Fuga de agua", status: "PENDING" });
    expect(incident).not.toHaveProperty("description");

    const charge = res.body.data.items.find((item: { type: string }) => item.type === "CHARGE");
    expect(charge).toMatchObject({ amount: 100, status: "PAID" });
  });

  it("no mezcla movimientos de otra propiedad ni de otro residente", async () => {
    const mine = await makeProperty("K-A");
    const other = await makeProperty("K-B");
    const resident = await makeResident(mine.id);
    const neighbor = await makeResident(other.id);

    await makeInvitation(mine.id, resident.user.id, new Date(), null, "K-MINE");
    await makeInvitation(other.id, neighbor.user.id, new Date(), null, "K-OTHER");

    const res = await request(app).get(kardexUrl).set("Authorization", resident.auth);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((item: { referenceId: number }) => item.referenceId);
    expect(ids).toContain((await prisma.invitation.findUniqueOrThrow({ where: { code: "K-MINE" } })).id);
    expect(ids).not.toContain((await prisma.invitation.findUniqueOrThrow({ where: { code: "K-OTHER" } })).id);
  });

  it("por defecto muestra los últimos 90 días", async () => {
    const property = await makeProperty("K-90");
    const resident = await makeResident(property.id);
    const { admin, auth } = await adminAuth();
    const old = new Date(Date.now() - 100 * DAY);

    await makeInvitation(property.id, resident.user.id, new Date(), null, "K-RECENT");
    await makeInvitation(property.id, resident.user.id, old, null, "K-OLD");
    await makeIncident(property.id, admin.id, "Reciente", new Date());
    await makeIncident(property.id, admin.id, "Vieja", old);

    const oldCharge = await createCharge(auth, property.id, resident.user.id, 50);
    await prisma.charge.update({ where: { id: oldCharge.id }, data: { createdAt: old } });
    await prisma.payment.create({
      data: {
        propertyId: property.id,
        residentId: resident.user.id,
        amount: 50,
        method: "EFECTIVO",
        paidAt: old,
        registeredById: admin.id,
      },
    });

    const res = await request(app).get(kardexUrl).set("Authorization", resident.auth);
    expect(res.status).toBe(200);
    const titles = res.body.data.items.map((item: { title: string }) => item.title);
    expect(titles).toContain("Entrada de Invitado K-RECENT");
    expect(titles).toContain("Reciente");
    expect(titles).not.toContain("Entrada de Invitado K-OLD");
    expect(titles).not.toContain("Vieja");
    expect(titles).not.toContain("Cargo 50");
  });

  it("filtra por tipo y pagina en servidor", async () => {
    const property = await makeProperty("K-F");
    const resident = await makeResident(property.id);
    const { admin, auth } = await adminAuth();

    await makeInvitation(property.id, resident.user.id, new Date(Date.now() - DAY), null, "K-F1");
    await makeIncident(property.id, admin.id, "Incidencia K", new Date(Date.now() - 2 * DAY));
    await createCharge(auth, property.id, resident.user.id, 100);
    await createPayment(auth, property.id, resident.user.id, 100);

    const access = await request(app).get(`${kardexUrl}?type=ACCESS`).set("Authorization", resident.auth);
    expect(access.status).toBe(200);
    expect(access.body.data.items.every((item: { type: string }) => item.type.startsWith("ACCESS"))).toBe(true);

    const finance = await request(app).get(`${kardexUrl}?type=FINANCE`).set("Authorization", resident.auth);
    expect(finance.body.data.items.every((item: { type: string }) => ["CHARGE", "PAYMENT"].includes(item.type))).toBe(true);

    const firstPage = await request(app).get(`${kardexUrl}?page=1&pageSize=2`).set("Authorization", resident.auth);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.items).toHaveLength(2);
    expect(firstPage.body.data.total).toBe(4);
  });

  it("un residente sin propiedad activa no accede (403)", async () => {
    const resident = await makeResident(null);
    const res = await request(app).get(kardexUrl).set("Authorization", resident.auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NO_ACTIVE_RESIDENCE");
  });
});
