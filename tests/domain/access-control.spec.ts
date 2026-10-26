/**
 * Fase 2A — bloqueo por adeudo en caseta, excepciones de administración y
 * bitácora base de accesos.
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
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + DAY).toISOString().slice(0, 10);

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

const makeResident = async (propertyId: number) => {
  const user = await buildUser("RESDN");
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
  await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const adminAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
const guardAuth = async () => {
  const guard = await buildUser("GUARD");
  return { guard, auth: `Bearer ${tokenFor(guard)}` };
};

const createCharge = async (auth: string, propertyId: number, residentId: number, dueDate: string) =>
  request(app).post(`${api}/charges`).set("Authorization", auth).send({
    propertyId,
    residentId,
    concept: "Cuota vencida",
    category: "EXTRA",
    amount: 1000,
    dueDate,
  });

const createInvitation = async (propertyId: number, createdById: number) => {
  const type = await prisma.invitationType.findFirstOrThrow({ where: { name: "VISITOR" } });
  return prisma.invitation.create({
    data: {
      code: `AXZ-DEBT-${Date.now()}`,
      guestName: "Visita con adeudo",
      createdById,
      propertyId,
      validFrom: new Date(Date.now() - DAY),
      validUntil: new Date(Date.now() + DAY),
      typeId: type.id,
    },
  });
};

describe("regla de morosos", () => {
  it("inicia con 30 días, bloquea visitas y puede actualizarse", async () => {
    const auth = await adminAuth();
    const initial = await request(app).get(`${api}/access/delinquency-rule`).set("Authorization", auth);
    expect(initial.status).toBe(200);
    expect(initial.body.data).toMatchObject({ enabled: true, minOverdueDays: 30, blockVisitors: true, active: true });

    const updated = await request(app)
      .put(`${api}/access/delinquency-rule`)
      .set("Authorization", auth)
      .send({ enabled: true, minOverdueDays: 45, blockVisitors: true, active: true });
    expect(updated.status).toBe(200);
    expect(updated.body.data.minOverdueDays).toBe(45);
  });

  it("el residente no consulta ni cambia la regla", async () => {
    const property = await makeProperty("AC-1");
    const resident = await makeResident(property.id);
    expect((await request(app).get(`${api}/access/delinquency-rule`).set("Authorization", resident.auth)).status).toBe(403);
    expect((await request(app).put(`${api}/access/delinquency-rule`).set("Authorization", resident.auth).send({ enabled: false, minOverdueDays: 0, blockVisitors: true, active: true })).status).toBe(403);
  });
});

describe("bloqueo de visitas por adeudo", () => {
  it("bloquea la entrada de una visita, no expone el monto y deja el evento denegado", async () => {
    const property = await makeProperty("AC-2");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { guard, auth: guardToken } = await guardAuth();
    const charge = await createCharge(admin, property.id, resident.user.id, daysAgo(40));
    expect(charge.status).toBe(201);
    const invitation = await createInvitation(property.id, resident.user.id);

    const status = await request(app).get(`${api}/access/status?propertyId=${property.id}`).set("Authorization", guardToken);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({ blocked: true, reason: "PROPERTY_DEBT", debtStatus: "OVERDUE", blockVisitors: true });
    expect(status.body.data).not.toHaveProperty("overdueAmount");

    const entry = await request(app)
      .put(`${api}/invitations/${invitation.id}/status`)
      .set("Authorization", guardToken)
      .send({ status: "ENTERED" });
    expect(entry.status).toBe(403);
    expect(entry.body.code).toBe("ACCESS_BLOCKED_BY_DEBT");

    const after = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(after.status).toBe("PENDING");

    const event = await prisma.accessEvent.findFirstOrThrow({ where: { invitationId: invitation.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ decision: "DENIED", reason: "PROPERTY_DEBT", guardId: guard.id, method: "QR", direction: "ENTRY" });
  });

  it("administración autoriza una excepción temporal y la visita puede entrar", async () => {
    const property = await makeProperty("AC-3");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { auth: guardToken } = await guardAuth();
    await createCharge(admin, property.id, resident.user.id, daysAgo(40));
    const invitation = await createInvitation(property.id, resident.user.id);

    const exception = await request(app)
      .post(`${api}/access/exceptions`)
      .set("Authorization", admin)
      .send({ propertyId: property.id, reason: "Convenio de pago firmado", validUntil: tomorrow() });
    expect(exception.status).toBe(201);

    const status = await request(app).get(`${api}/access/status?propertyId=${property.id}`).set("Authorization", guardToken);
    expect(status.body.data).toMatchObject({ blocked: false, reason: "EXCEPTION" });

    const entry = await request(app)
      .put(`${api}/invitations/${invitation.id}/status`)
      .set("Authorization", guardToken)
      .send({ status: "ENTERED" });
    expect(entry.status).toBe(200);

    const event = await prisma.accessEvent.findFirstOrThrow({ where: { invitationId: invitation.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ decision: "ALLOWED", reason: "EXCEPTION", guardId: expect.any(Number) });
  });

  it("niega el pase de una persona autorizada si la propiedad tiene adeudo", async () => {
    const property = await makeProperty("AC-6");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { guard, auth: guardToken } = await guardAuth();
    await createCharge(admin, property.id, resident.user.id, daysAgo(40));

    const person = await prisma.person.create({ data: { firstName: "Visita Autorizada" } });
    const authorization = await prisma.propertyAuthorization.create({
      data: {
        propertyId: property.id,
        personId: person.id,
        scope: "PEDESTRIAN",
        days: "0,1,2,3,4,5,6",
        startTime: "00:00",
        endTime: "23:59",
        validFrom: new Date(daysAgo(1)),
        createdById: resident.user.id,
      },
    });
    const pass = await request(app).post(`${api}/authorizations/${authorization.id}/pass`).set("Authorization", admin);
    expect(pass.status).toBe(201);

    const verification = await request(app)
      .post(`${api}/authorizations/pass/verify`)
      .set("Authorization", guardToken)
      .send({ token: pass.body.data.token, scope: "PEDESTRIAN" });
    expect(verification.status).toBe(200);
    expect(verification.body.data).toMatchObject({ decision: "DENIED", reason: "PROPERTY_DEBT" });

    const event = await prisma.accessEvent.findFirstOrThrow({ where: { personId: person.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ decision: "DENIED", reason: "PROPERTY_DEBT", guardId: guard.id });
  });

  it("si la regla está desactivada, no bloquea aunque haya adeudo", async () => {
    const property = await makeProperty("AC-4");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { auth: guardToken } = await guardAuth();
    await createCharge(admin, property.id, resident.user.id, daysAgo(40));
    await request(app)
      .put(`${api}/access/delinquency-rule`)
      .set("Authorization", admin)
      .send({ enabled: false, minOverdueDays: 30, blockVisitors: true, active: true });

    const status = await request(app).get(`${api}/access/status?propertyId=${property.id}`).set("Authorization", guardToken);
    expect(status.body.data).toMatchObject({ blocked: false, reason: "RULE_DISABLED" });
  });

  it("la bitácora permite filtrar por propiedad y decisión", async () => {
    const property = await makeProperty("AC-5");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { auth: guardToken } = await guardAuth();
    await createCharge(admin, property.id, resident.user.id, daysAgo(40));
    const invitation = await createInvitation(property.id, resident.user.id);
    await request(app).put(`${api}/invitations/${invitation.id}/status`).set("Authorization", guardToken).send({ status: "ENTERED" });

    const events = await request(app)
      .get(`${api}/access/events?propertyId=${property.id}&decision=DENIED`)
      .set("Authorization", admin);
    expect(events.status).toBe(200);
    expect(events.body.data.total).toBeGreaterThan(0);
    expect(events.body.data.items.every((item: any) => item.decision === "DENIED")).toBe(true);
  });
});
