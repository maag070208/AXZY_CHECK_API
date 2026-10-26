/**
 * Módulo 13 fase 3/4: cargos, pagos FIFO, saldo del residente, aislamiento,
 * reversa, folios consecutivos y recibo PDF.
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
const charges = `${api}/charges`;
const payments = `${api}/payments`;

const binaryParser = (res: any, callback: (error: Error | null, body?: Buffer) => void) => {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk: string) => {
    data += chunk;
  });
  res.on("end", () => callback(null, Buffer.from(data, "binary")));
};

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

const createCharge = (
  auth: string,
  body: {
    propertyId: number;
    residentId?: number;
    concept?: string;
    category?: string;
    amount?: number;
    dueDate?: string;
    period?: string | null;
  },
) =>
  request(app)
    .post(charges)
    .set("Authorization", auth)
    .send({
      propertyId: body.propertyId,
      residentId: body.residentId,
      concept: body.concept ?? "Cargo de prueba",
      category: body.category ?? "EXTRA",
      amount: body.amount ?? 1000,
      dueDate: body.dueDate ?? "2026-11-10",
      ...(body.category === "CUOTA" ? { period: body.period ?? "2026-11" } : {}),
    });

const pay = (
  auth: string,
  body: { propertyId: number; residentId: number; amount: number; allowOverpayment?: boolean; paidAt?: string },
) =>
  request(app)
    .post(payments)
    .set("Authorization", auth)
    .send({
      propertyId: body.propertyId,
      residentId: body.residentId,
      amount: body.amount,
      method: "EFECTIVO",
      reference: "REC-TEST",
      paidAt: body.paidAt ?? "2026-11-05",
      ...(body.allowOverpayment !== undefined ? { allowOverpayment: body.allowOverpayment } : {}),
    });

describe("cargos", () => {
  it("crea un cargo para el residente titular y rechaza una cuota duplicada del mismo periodo", async () => {
    const property = await makeProperty("F-1");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();

    const created = await createCharge(auth, {
      propertyId: property.id,
      residentId: resident.user.id,
      category: "CUOTA",
      concept: "Cuota mensual 2026-11",
      amount: 1000,
      period: "2026-11",
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      propertyId: property.id,
      residentId: resident.user.id,
      status: "PENDING",
      amount: 1000,
      paidAmount: 0,
      outstanding: 1000,
    });

    const duplicate = await createCharge(auth, {
      propertyId: property.id,
      residentId: resident.user.id,
      category: "CUOTA",
      period: "2026-11",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("PERIOD_ALREADY_CHARGED");
  });

  it("genera la cuota mensual en todas las propiedades una sola vez", async () => {
    const propertyA = await makeProperty("F-MA");
    const propertyB = await makeProperty("F-MB");
    await makeResident(propertyA.id);
    await makeResident(propertyB.id);
    const auth = await adminAuth();

    const body = { period: "2026-11", amount: 1000, dueDate: "2026-11-10" };
    const first = await request(app).post(`${charges}/monthly`).set("Authorization", auth).send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(2);

    const second = await request(app).post(`${charges}/monthly`).set("Authorization", auth).send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.created).toBe(0);
    expect(second.body.data.skipped).toBe(2);
  });

  it("el residente no puede registrar cargos ni listar los del personal", async () => {
    const property = await makeProperty("F-P");
    const resident = await makeResident(property.id);
    const denied = await createCharge(resident.auth, { propertyId: property.id, residentId: resident.user.id });
    expect(denied.status).toBe(403);
    expect((await request(app).get(charges).set("Authorization", resident.auth)).status).toBe(403);
    expect((await request(app).get(`${api}/finance/summary`).set("Authorization", resident.auth)).status).toBe(403);
  });
});

describe("pagos y saldo", () => {
  it("aplica el pago FIFO por vencimiento y el residente solo ve su saldo", async () => {
    const property = await makeProperty("F-2");
    const resident = await makeResident(property.id);
    const otherProperty = await makeProperty("F-2B");
    const otherResident = await makeResident(otherProperty.id);
    const auth = await adminAuth();

    await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 1000, dueDate: "2026-11-01" });
    await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 500, dueDate: "2026-12-01" });
    await createCharge(auth, { propertyId: otherProperty.id, residentId: otherResident.user.id, amount: 700, dueDate: "2026-11-01" });

    const paid = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 1200 });
    expect(paid.status).toBe(201);

    const rows = await prisma.charge.findMany({ where: { residentId: resident.user.id }, orderBy: { dueDate: "asc" } });
    expect(rows.map((row) => row.status)).toEqual(["PAID", "PARTIAL"]);

    const balance = await request(app).get(`${api}/residents/me/balance`).set("Authorization", resident.auth);
    expect(balance.status).toBe(200);
    expect(balance.body.data).toMatchObject({ totalCharges: 1500, totalPaid: 1200, balance: 300, pendingCharges: 1 });

    const ownPayments = await request(app).get(`${api}/residents/me/payments`).set("Authorization", resident.auth);
    expect(ownPayments.status).toBe(200);
    expect(ownPayments.body.data.payments).toHaveLength(1);
    expect(ownPayments.body.data.payments[0]).toMatchObject({ amount: 1200, appliedAmount: 1200 });

    const otherBalance = await request(app).get(`${api}/residents/me/balance`).set("Authorization", otherResident.auth);
    expect(otherBalance.body.data).toMatchObject({ totalCharges: 700, totalPaid: 0, balance: 700 });
    const otherPayments = await request(app).get(`${api}/residents/me/payments`).set("Authorization", otherResident.auth);
    expect(otherPayments.body.data.payments).toHaveLength(0);
  });

  it("un pago mayor al saldo exige confirmación y registra el excedente como saldo a favor", async () => {
    const property = await makeProperty("F-3");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();
    await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 400 });

    const rejected = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 600 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("PAYMENT_EXCEEDS_BALANCE");

    const accepted = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 600, allowOverpayment: true });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data).toMatchObject({ amount: 600, unallocatedAmount: 200 });

    const balance = await request(app).get(`${api}/residents/me/balance`).set("Authorization", resident.auth);
    expect(balance.body.data).toMatchObject({ totalCharges: 400, totalPaid: 600, credit: 200, balance: -200 });
  });

  it("reversar el pago devuelve el cargo a pendiente y deja rastro", async () => {
    const property = await makeProperty("F-4");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();
    const charge = await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 400 });
    const payment = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 400 });
    expect(payment.status).toBe(201);

    const cancelPaid = await request(app).patch(`${charges}/${charge.body.data.id}/cancel`).set("Authorization", auth).send({ reason: "Duplicado" });
    expect(cancelPaid.status).toBe(409);
    expect(cancelPaid.body.code).toBe("CHARGE_HAS_PAYMENTS");

    const voided = await request(app)
      .post(`${payments}/${payment.body.data.id}/void`)
      .set("Authorization", auth)
      .send({ reason: "Se registró por error" });
    expect(voided.status).toBe(200);

    const row = await prisma.charge.findUniqueOrThrow({ where: { id: charge.body.data.id } });
    expect(row.status).toBe("PENDING");

    const balance = await request(app).get(`${api}/residents/me/balance`).set("Authorization", resident.auth);
    expect(balance.body.data).toMatchObject({ totalCharges: 400, totalPaid: 0, balance: 400 });
    expect(balance.body.data.payments).toBeUndefined();
  });

  it("el residente no registra ni reversa pagos", async () => {
    const property = await makeProperty("F-5");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();
    const charge = await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100 });
    const payment = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100 });

    expect((await pay(resident.auth, { propertyId: property.id, residentId: resident.user.id, amount: 100 })).status).toBe(403);
    expect((await request(app).post(`${payments}/${payment.body.data.id}/void`).set("Authorization", resident.auth).send({ reason: "No" })).status).toBe(403);
    expect(charge.status).toBe(201);
  });
});

describe("folios y recibo", () => {
  it("asigna folios consecutivos y genera un PDF para el pago", async () => {
    const property = await makeProperty("F-6");
    const resident = await makeResident(property.id);
    const auth = await adminAuth();
    await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100, dueDate: "2026-11-01" });
    await createCharge(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100, dueDate: "2026-11-02" });

    const first = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100 });
    const second = await pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.folio).toBe(1);
    expect(second.body.data.folio).toBe(2);

    const receipt = await request(app)
      .get(`${payments}/${second.body.data.id}/receipt`)
      .set("Authorization", auth)
      .buffer(true)
      .parse(binaryParser);
    expect(receipt.status).toBe(200);
    expect(receipt.headers["content-type"]).toContain("application/pdf");
    expect(receipt.headers["content-disposition"]).toContain("recibo-000002.pdf");
    expect(receipt.body.subarray(0, 4).toString()).toBe("%PDF");

    const ownReceipt = await request(app)
      .get(`${api}/residents/me/payments/${second.body.data.id}/receipt`)
      .set("Authorization", resident.auth)
      .buffer(true)
      .parse(binaryParser);
    expect(ownReceipt.status).toBe(200);
  });

  it("protege el recibo de otro residente y no deja folios duplicados en concurrencia", async () => {
    const property = await makeProperty("F-7");
    const resident = await makeResident(property.id);
    const other = await makeResident((await makeProperty("F-7B")).id);
    const auth = await adminAuth();
    for (let index = 0; index < 5; index += 1) {
      await createCharge(auth, {
        propertyId: property.id,
        residentId: resident.user.id,
        amount: 100,
        dueDate: `2026-11-0${index + 1}`,
      });
    }

    const results = await Promise.all(
      Array.from({ length: 5 }, () => pay(auth, { propertyId: property.id, residentId: resident.user.id, amount: 100 })),
    );
    results.forEach((result) => expect(result.status).toBe(201));
    const folios = results.map((result) => result.body.data.folio).sort((a, b) => a - b);
    expect(folios).toEqual([1, 2, 3, 4, 5]);

    const rows = await prisma.charge.findMany({
      where: { residentId: resident.user.id },
      include: { allocations: { select: { amount: true } } },
    });
    for (const row of rows) {
      const allocated = row.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      expect(allocated).toBeLessThanOrEqual(Number(row.amount));
    }

    const denied = await request(app)
      .get(`${api}/residents/me/payments/${results[0].body.data.id}/receipt`)
      .set("Authorization", other.auth);
    expect(denied.status).toBe(404);
  });
});
