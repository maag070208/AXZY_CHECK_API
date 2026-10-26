/**
 * Cobranza configurable: periodicidad, generación de cuotas y recargos.
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
const collections = `${api}/collections`;
const charges = `${api}/charges`;

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

const configBody = (propertyId: number, overrides: Record<string, unknown> = {}) => ({
  propertyId,
  concept: "Cuota de mantenimiento",
  amount: 1000,
  frequency: "MONTHLY",
  dueDay: 10,
  nextChargeDate: "2026-11-10",
  graceDays: 5,
  lateFeeType: "NONE",
  lateFeeValue: 0,
  active: true,
  ...overrides,
});

const saveConfig = (auth: string, propertyId: number, overrides: Record<string, unknown> = {}) =>
  request(app).post(`${collections}/configs`).set("Authorization", auth).send(configBody(propertyId, overrides));

describe("configuración de cobranza", () => {
  it("crea, lista y actualiza la configuración por propiedad", async () => {
    const property = await makeProperty("C-1");
    await makeResident(property.id);
    const auth = await adminAuth();

    const created = await saveConfig(auth, property.id);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      propertyId: property.id,
      amount: 1000,
      frequency: "MONTHLY",
      dueDay: 10,
      nextChargeDate: "2026-11-10",
      graceDays: 5,
      lateFeeType: "NONE",
      active: true,
      property: { identifier: "C-1" },
    });

    const list = await request(app).get(`${collections}/configs`).set("Authorization", auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const updated = await request(app)
      .put(`${collections}/configs/${created.body.data.id}`)
      .set("Authorization", auth)
      .send({ amount: 1200, frequency: "BIMONTHLY", lateFeeType: "FIXED", lateFeeValue: 150 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ amount: 1200, frequency: "BIMONTHLY", lateFeeType: "FIXED", lateFeeValue: 150 });

    const invalid = await request(app)
      .put(`${collections}/configs/${created.body.data.id}`)
      .set("Authorization", auth)
      .send({ lateFeeType: "PERCENT", lateFeeValue: 0 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_LATE_FEE");
  });

  it("el residente no puede ver ni modificar la cobranza", async () => {
    const property = await makeProperty("C-2");
    const resident = await makeResident(property.id);
    expect((await request(app).get(`${collections}/configs`).set("Authorization", resident.auth)).status).toBe(403);
    expect((await saveConfig(resident.auth, property.id)).status).toBe(403);
    expect((await request(app).post(`${collections}/generate`).set("Authorization", resident.auth).send({})).status).toBe(403);
  });
});

describe("generación de cuotas", () => {
  it("genera las cuotas que tocan y avanza el próximo cobro sin duplicar", async () => {
    const property = await makeProperty("C-3");
    await makeResident(property.id);
    const auth = await adminAuth();
    await saveConfig(auth, property.id, { nextChargeDate: "2026-11-10" });

    const first = await request(app)
      .post(`${collections}/generate`)
      .set("Authorization", auth)
      .send({ throughDate: "2026-11-30" });
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(1);
    expect(first.body.data.results[0]).toMatchObject({ propertyId: property.id, status: "created", period: "2026-11" });

    const config = await prisma.collectionConfig.findUniqueOrThrow({ where: { propertyId: property.id } });
    expect(config.nextChargeDate.toISOString().slice(0, 10)).toBe("2026-12-10");

    const again = await request(app)
      .post(`${collections}/generate`)
      .set("Authorization", auth)
      .send({ throughDate: "2026-11-30" });
    expect(again.body.data.created).toBe(0);

    const catchUp = await request(app)
      .post(`${collections}/generate`)
      .set("Authorization", auth)
      .send({ throughDate: "2027-02-28" });
    expect(catchUp.body.data.created).toBe(3);
    const count = await prisma.charge.count({ where: { propertyId: property.id, category: "CUOTA" } });
    expect(count).toBe(4);
  });

  it("respeta la frecuencia bimestral", async () => {
    const property = await makeProperty("C-4");
    await makeResident(property.id);
    const auth = await adminAuth();
    await saveConfig(auth, property.id, { frequency: "BIMONTHLY", nextChargeDate: "2026-11-10" });

    const res = await request(app)
      .post(`${collections}/generate`)
      .set("Authorization", auth)
      .send({ throughDate: "2027-01-31" });
    expect(res.body.data.created).toBe(2);
    const periods = (await prisma.charge.findMany({ where: { propertyId: property.id }, orderBy: { period: "asc" } })).map((row) => row.period);
    expect(periods).toEqual(["2026-11", "2027-01"]);
  });
});

describe("recargos", () => {
  const createOverdueCharge = async (auth: string, propertyId: number, residentId: number, amount = 1000) => {
    const res = await request(app).post(charges).set("Authorization", auth).send({
      propertyId,
      residentId,
      concept: "Cuota vencida",
      category: "EXTRA",
      amount,
      dueDate: "2026-10-01",
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  it("aplica un recargo porcentual una sola vez por cargo vencido", async () => {
    const property = await makeProperty("C-5");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();
    const chargeId = await createOverdueCharge(auth, property.id, resident.user.id, 1000);
    await request(app).post(`${api}/payments`).set("Authorization", auth).send({
      propertyId: property.id,
      residentId: resident.user.id,
      amount: 400,
      method: "EFECTIVO",
      paidAt: "2026-10-15",
    });

    await saveConfig(auth, property.id, {
      lateFeeType: "PERCENT",
      lateFeeValue: 10,
      graceDays: 5,
      nextChargeDate: "2026-12-10",
    });

    const first = await request(app).post(`${collections}/apply-late-fees`).set("Authorization", auth).send({});
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(1);
    expect(first.body.data.results[0]).toMatchObject({ chargeId, amount: 60, status: "created" });

    const recargo = await prisma.charge.findFirstOrThrow({ where: { sourceChargeId: chargeId } });
    expect(recargo).toMatchObject({ category: "RECARGO", residentId: resident.user.id, period: null });
    expect(Number(recargo.amount)).toBe(60);

    const second = await request(app).post(`${collections}/apply-late-fees`).set("Authorization", auth).send({});
    expect(second.body.data.created).toBe(0);
  });

  it("no genera recargo antes de los días de gracia ni para cargos pagados", async () => {
    const property = await makeProperty("C-6");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();
    const recent = await createOverdueCharge(auth, property.id, resident.user.id, 500);
    await prisma.charge.update({ where: { id: recent }, data: { dueDate: new Date("2026-10-24") } });
    const paid = await createOverdueCharge(auth, property.id, resident.user.id, 500);
    await prisma.charge.update({ where: { id: paid }, data: { status: "PAID" } });

    await saveConfig(auth, property.id, { lateFeeType: "FIXED", lateFeeValue: 100, graceDays: 5 });
    const res = await request(app).post(`${collections}/apply-late-fees`).set("Authorization", auth).send({});
    expect(res.body.data.created).toBe(0);
  });
});
