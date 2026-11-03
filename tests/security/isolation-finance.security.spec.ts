/**
 * Multicliente, fase 2 · finanzas y cobranza: el cliente A no ve ni toca datos del cliente B.
 * Una organización COMPANY con dos clientes (cada uno con una propiedad y su residente); el administrador
 * elige con X-Client-Id, y los residentes solo acceden a lo suyo desde /residents/me/*.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

const V1 = "/api/v1";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });

const makeProperty = async (clientId: number, organizationId: number, identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: {
      clientId,
      identifier,
      name: identifier,
      mainStreet: "Calle",
      typeId: type.id,
      statusId: status.id,
      kindId: kind.id,
      occupancyStatusId: vacant.id,
    },
  });
  await prisma.occupancyPeriod.create({ data: { propertyId: property.id, statusId: vacant.id, startDate: new Date() } });

  // El residente hereda el cliente de su propiedad: `authenticate` lo resuelve por User.propertyId y
  // las finanzas por el vínculo Person → Resident(ACTIVE) → Property.
  const resident = await buildUser("RESDN", { scope: { organizationId, clientId } });
  await prisma.user.update({ where: { id: resident.id }, data: { propertyId: property.id } });
  const residentKind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { clientId, firstName: resident.name, userId: resident.id } });
  await prisma.resident.create({
    data: { personId: person.id, propertyId: property.id, kindId: residentKind.id, isPrimary: true, startDate: new Date() },
  });

  return { property, resident };
};

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const ownerA = await makeProperty(a.id, organization.id, "FIN-A-1");
  const ownerB = await makeProperty(b.id, organization.id, "FIN-B-1");
  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });

  const createCharge = async (clientId: number, propertyId: number, residentId: number, amount: number, dueDate = "2026-11-10") => {
    const res = await request(app)
      .post(`${V1}/charges`)
      .set(asAdmin(clientId))
      .send({ propertyId, residentId, concept: "Cargo de prueba", category: "EXTRA", amount, dueDate });
    expect(res.status).toBe(201);
    return res.body.data as { id: number; amount: number };
  };

  const createPayment = async (clientId: number, propertyId: number, residentId: number, amount: number) => {
    const res = await request(app)
      .post(`${V1}/payments`)
      .set(asAdmin(clientId))
      .send({ propertyId, residentId, amount, method: "EFECTIVO", paidAt: "2026-11-05" });
    expect(res.status).toBe(201);
    return res.body.data as { id: number; amount: number };
  };

  return { organization, a, b, admin, ownerA, ownerB, asAdmin, createCharge, createPayment };
};

describe("cargos · aislamiento por cliente", () => {
  it("el listado y el resumen solo incluyen el cliente elegido", async () => {
    const { a, b, admin, ownerA, ownerB, asAdmin, createCharge } = await setup();
    const chargeA = await createCharge(a.id, ownerA.property.id, ownerA.resident.id, 1000);
    const chargeB = await createCharge(b.id, ownerB.property.id, ownerB.resident.id, 500);

    const listA = await request(app).get(`${V1}/charges`).set(asAdmin(a.id));
    expect(listA.status).toBe(200);
    expect(listA.body.data.data.map((row: any) => row.id)).toEqual([chargeA.id]);
    expect(listA.body.data.total).toBe(1);

    const listB = await request(app).get(`${V1}/charges`).set(asAdmin(b.id));
    expect(listB.body.data.data.map((row: any) => row.id)).toEqual([chargeB.id]);

    // Filtrar por la propiedad de A desde B tampoco la revela: devuelve vacío.
    const filtered = await request(app).get(`${V1}/charges`).query({ propertyId: ownerA.property.id }).set(asAdmin(b.id));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toMatchObject({ data: [], total: 0 });

    // Sin X-Client-Id en una organización con varios clientes no hay alcance: 403.
    expect((await request(app).get(`${V1}/charges`).set(bearer(admin))).status).toBe(403);
    expect((await request(app).get(`${V1}/finance/summary`).set(bearer(admin))).status).toBe(403);

    const summaryA = await request(app).get(`${V1}/finance/summary`).set(asAdmin(a.id));
    expect(summaryA.status).toBe(200);
    expect(summaryA.body.data.totals).toMatchObject({ properties: 1, totalCharges: 1000, balance: 1000 });
    expect(summaryA.body.data.items.map((item: any) => item.identifier)).toEqual(["FIN-A-1"]);

    const summaryB = await request(app).get(`${V1}/finance/summary`).set(asAdmin(b.id));
    expect(summaryB.body.data.totals).toMatchObject({ properties: 1, totalCharges: 500, balance: 500 });
    expect(summaryB.body.data.items.map((item: any) => item.identifier)).toEqual(["FIN-B-1"]);
  });

  it("desde B no se crea un cargo con una propiedad de A (400) ni se cancela un cargo de A (404)", async () => {
    const { a, b, ownerA, asAdmin, createCharge } = await setup();
    const chargeA = await createCharge(a.id, ownerA.property.id, ownerA.resident.id, 1000);

    const foreign = await request(app)
      .post(`${V1}/charges`)
      .set(asAdmin(b.id))
      .send({ propertyId: ownerA.property.id, residentId: ownerA.resident.id, concept: "Cargo ajeno", category: "EXTRA", amount: 100, dueDate: "2026-11-10" });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe("PROPERTY_NOT_IN_CLIENT");
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id } })).toBe(1);

    const previous = await request(app)
      .patch(`${V1}/charges/${chargeA.id}/cancel`)
      .set(asAdmin(b.id))
      .send({ reason: "Intento desde otro cliente" });
    expect(previous.status).toBe(404);
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: chargeA.id } })).toMatchObject({ status: "PENDING" });

    // Mismo cargo desde su cliente: se cancela.
    const own = await request(app)
      .patch(`${V1}/charges/${chargeA.id}/cancel`)
      .set(asAdmin(a.id))
      .send({ reason: "Cancelado en su cliente" });
    expect(own.status).toBe(200);
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: chargeA.id } })).toMatchObject({ status: "CANCELLED" });
  });

  it("la generación mensual desde B no toca las propiedades de A", async () => {
    const { a, b, ownerA, asAdmin } = await setup();

    const monthly = await request(app)
      .post(`${V1}/charges/monthly`)
      .set(asAdmin(b.id))
      .send({ period: "2026-11", amount: 1000, dueDate: "2026-11-10" });
    expect(monthly.status).toBe(200);
    expect(monthly.body.data.created).toBe(1);
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id } })).toBe(0);

    // Pedir explícitamente una propiedad de A desde B es una referencia ajena: 400 y no crea nada.
    const foreign = await request(app)
      .post(`${V1}/charges/monthly`)
      .set(asAdmin(b.id))
      .send({ period: "2026-12", amount: 1000, dueDate: "2026-12-10", propertyIds: [ownerA.property.id] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe("PROPERTY_NOT_IN_CLIENT");
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id } })).toBe(0);

    // Desde A sí se genera en A.
    const own = await request(app)
      .post(`${V1}/charges/monthly`)
      .set(asAdmin(a.id))
      .send({ period: "2026-11", amount: 1000, dueDate: "2026-11-10" });
    expect(own.body.data.created).toBe(1);
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id } })).toBe(1);
  });
});

describe("pagos y recibos · aislamiento por cliente", () => {
  it("el listado de pagos solo muestra el cliente elegido", async () => {
    const { a, b, ownerA, ownerB, asAdmin, createCharge, createPayment } = await setup();
    await createCharge(a.id, ownerA.property.id, ownerA.resident.id, 100, "2026-11-01");
    await createCharge(b.id, ownerB.property.id, ownerB.resident.id, 200, "2026-11-01");
    const paymentA = await createPayment(a.id, ownerA.property.id, ownerA.resident.id, 100);
    const paymentB = await createPayment(b.id, ownerB.property.id, ownerB.resident.id, 200);

    const listA = await request(app).get(`${V1}/payments`).set(asAdmin(a.id));
    expect(listA.status).toBe(200);
    expect(listA.body.data.data.map((row: any) => row.id)).toEqual([paymentA.id]);
    expect(listA.body.data.total).toBe(1);

    const listB = await request(app).get(`${V1}/payments`).set(asAdmin(b.id));
    expect(listB.body.data.data.map((row: any) => row.id)).toEqual([paymentB.id]);
  });

  it("desde B no se paga con propiedad de A (400), no se aplican cargos de A (400) ni se reversa un pago de A (404)", async () => {
    const { a, b, ownerA, ownerB, asAdmin, createCharge, createPayment } = await setup();
    const chargeA = await createCharge(a.id, ownerA.property.id, ownerA.resident.id, 100, "2026-11-01");
    const paymentA = await createPayment(a.id, ownerA.property.id, ownerA.resident.id, 100);

    const foreignProperty = await request(app)
      .post(`${V1}/payments`)
      .set(asAdmin(b.id))
      .send({ propertyId: ownerA.property.id, residentId: ownerA.resident.id, amount: 50, method: "EFECTIVO" });
    expect(foreignProperty.status).toBe(400);
    expect(foreignProperty.body.code).toBe("PROPERTY_NOT_IN_CLIENT");

    await createCharge(b.id, ownerB.property.id, ownerB.resident.id, 100, "2026-11-01");
    const foreignCharge = await request(app)
      .post(`${V1}/payments`)
      .set(asAdmin(b.id))
      .send({ propertyId: ownerB.property.id, residentId: ownerB.resident.id, amount: 50, method: "EFECTIVO", chargeIds: [chargeA.id] });
    expect(foreignCharge.status).toBe(400);
    expect(foreignCharge.body.code).toBe("CHARGE_NOT_FOUND");
    expect(await prisma.payment.count()).toBe(1);

    const foreignVoid = await request(app)
      .post(`${V1}/payments/${paymentA.id}/void`)
      .set(asAdmin(b.id))
      .send({ reason: "Intento desde otro cliente" });
    expect(foreignVoid.status).toBe(404);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentA.id } })).voidedAt).toBeNull();

    const foreignReceipt = await request(app).get(`${V1}/payments/${paymentA.id}/receipt`).set(asAdmin(b.id));
    expect(foreignReceipt.status).toBe(404);

    const ownReceipt = await request(app).get(`${V1}/payments/${paymentA.id}/receipt`).set(asAdmin(a.id));
    expect(ownReceipt.status).toBe(200);
    expect(ownReceipt.headers["content-type"]).toContain("application/pdf");
  });
});

describe("cobranza · aislamiento por cliente", () => {
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

  it("la configuración y la generación solo operan en el cliente elegido", async () => {
    const { a, b, ownerA, ownerB, asAdmin } = await setup();
    const configA = await request(app).post(`${V1}/collections/configs`).set(asAdmin(a.id)).send(configBody(ownerA.property.id));
    expect(configA.status).toBe(201);
    const configB = await request(app).post(`${V1}/collections/configs`).set(asAdmin(b.id)).send(configBody(ownerB.property.id));
    expect(configB.status).toBe(201);

    const listA = await request(app).get(`${V1}/collections/configs`).set(asAdmin(a.id));
    expect(listA.status).toBe(200);
    expect(listA.body.data.map((row: any) => row.id)).toEqual([configA.body.data.id]);

    const listB = await request(app).get(`${V1}/collections/configs`).set(asAdmin(b.id));
    expect(listB.body.data.map((row: any) => row.id)).toEqual([configB.body.data.id]);

    // La generación de B no toca las propiedades de A.
    const generatedB = await request(app).post(`${V1}/collections/generate`).set(asAdmin(b.id)).send({ throughDate: "2026-11-30" });
    expect(generatedB.status).toBe(200);
    expect(generatedB.body.data.created).toBe(1);
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id } })).toBe(0);
    expect(await prisma.charge.count({ where: { propertyId: ownerB.property.id } })).toBe(1);

    // Pedir una propiedad de A desde B es una referencia ajena: 400 sin efectos.
    const foreignGenerate = await request(app)
      .post(`${V1}/collections/generate`)
      .set(asAdmin(b.id))
      .send({ propertyId: ownerA.property.id, throughDate: "2026-11-30" });
    expect(foreignGenerate.status).toBe(400);
    expect(foreignGenerate.body.code).toBe("PROPERTY_NOT_IN_CLIENT");
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id } })).toBe(0);

    const foreignLateFees = await request(app)
      .post(`${V1}/collections/apply-late-fees`)
      .set(asAdmin(b.id))
      .send({ propertyId: ownerA.property.id });
    expect(foreignLateFees.status).toBe(400);
    expect(foreignLateFees.body.code).toBe("PROPERTY_NOT_IN_CLIENT");
  });

  it("los recargos desde B no tocan los cargos vencidos de A", async () => {
    const { a, b, ownerA, ownerB, asAdmin, createCharge } = await setup();
    await createCharge(a.id, ownerA.property.id, ownerA.resident.id, 1000, "2026-10-01");
    await createCharge(b.id, ownerB.property.id, ownerB.resident.id, 1000, "2026-10-01");
    await request(app)
      .post(`${V1}/collections/configs`)
      .set(asAdmin(a.id))
      .send(configBody(ownerA.property.id, { lateFeeType: "FIXED", lateFeeValue: 150, nextChargeDate: "2026-12-10" }));
    await request(app)
      .post(`${V1}/collections/configs`)
      .set(asAdmin(b.id))
      .send(configBody(ownerB.property.id, { lateFeeType: "FIXED", lateFeeValue: 150, nextChargeDate: "2026-12-10" }));

    const res = await request(app).post(`${V1}/collections/apply-late-fees`).set(asAdmin(b.id)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBeGreaterThan(0);
    expect(res.body.data.results.every((row: any) => row.propertyId === ownerB.property.id)).toBe(true);
    expect(await prisma.charge.count({ where: { propertyId: ownerA.property.id, category: "RECARGO" } })).toBe(0);
    expect(await prisma.charge.count({ where: { propertyId: ownerB.property.id, category: "RECARGO" } })).toBe(1);
  });

  it("desde B no se edita la configuración de A (404) ni se crea con una propiedad de A (400)", async () => {
    const { a, b, admin, ownerA, asAdmin } = await setup();
    const configA = await request(app).post(`${V1}/collections/configs`).set(asAdmin(a.id)).send(configBody(ownerA.property.id));
    expect(configA.status).toBe(201);

    const foreignUpdate = await request(app)
      .put(`${V1}/collections/configs/${configA.body.data.id}`)
      .set(asAdmin(b.id))
      .send({ amount: 5000 });
    expect(foreignUpdate.status).toBe(404);
    expect(Number((await prisma.collectionConfig.findUniqueOrThrow({ where: { id: configA.body.data.id } })).amount)).toBe(1000);

    const foreignCreate = await request(app)
      .post(`${V1}/collections/configs`)
      .set(asAdmin(b.id))
      .send(configBody(ownerA.property.id, { concept: "Cuota ajena" }));
    expect(foreignCreate.status).toBe(400);
    expect(foreignCreate.body.code).toBe("PROPERTY_NOT_IN_CLIENT");

    // Sin X-Client-Id en una organización con varios clientes: 403.
    expect((await request(app).get(`${V1}/collections/configs`).set(bearer(admin))).status).toBe(403);
  });
});

describe("autoservicio del residente · aislamiento por cliente", () => {
  it("el residente de A solo ve sus finanzas y no puede descargar el recibo de un pago de B", async () => {
    const { a, b, ownerA, ownerB, asAdmin, createCharge, createPayment } = await setup();
    await createCharge(a.id, ownerA.property.id, ownerA.resident.id, 1000);
    await createCharge(b.id, ownerB.property.id, ownerB.resident.id, 4000);
    const paymentA = await createPayment(a.id, ownerA.property.id, ownerA.resident.id, 1000);
    const paymentB = await createPayment(b.id, ownerB.property.id, ownerB.resident.id, 4000);

    const balance = await request(app).get(`${V1}/residents/me/balance`).set(bearer(ownerA.resident));
    expect(balance.status).toBe(200);
    expect(balance.body.data).toMatchObject({ totalCharges: 1000, totalPaid: 1000, balance: 0 });

    const finance = await request(app).get(`${V1}/residents/me/payments`).set(bearer(ownerA.resident));
    expect(finance.status).toBe(200);
    expect(finance.body.data.payments.map((row: any) => row.id)).toEqual([paymentA.id]);
    expect(finance.body.data.charges).toHaveLength(1);

    const foreignReceipt = await request(app)
      .get(`${V1}/residents/me/payments/${paymentB.id}/receipt`)
      .set(bearer(ownerA.resident));
    expect(foreignReceipt.status).toBe(404);

    const ownReceipt = await request(app)
      .get(`${V1}/residents/me/payments/${paymentA.id}/receipt`)
      .set(bearer(ownerA.resident));
    expect(ownReceipt.status).toBe(200);
    expect(ownReceipt.headers["content-type"]).toContain("application/pdf");

    // El expediente del residente (staff) tampoco se cruza de cliente.
    expect(
      (await request(app).get(`${V1}/residents/${ownerA.resident.id}/finance`).set(asAdmin(b.id))).status,
    ).toBe(404);
    expect(
      (await request(app).get(`${V1}/residents/${ownerA.resident.id}/finance`).set(asAdmin(a.id))).status,
    ).toBe(200);

    // La inversa: el residente de B tampoco ve lo de A.
    const financeB = await request(app).get(`${V1}/residents/me/payments`).set(bearer(ownerB.resident));
    expect(financeB.body.data.payments.map((row: any) => row.id)).toEqual([paymentB.id]);
    expect(
      (await request(app).get(`${V1}/residents/me/payments/${paymentA.id}/receipt`).set(bearer(ownerB.resident))).status,
    ).toBe(404);
    expect(b.id).not.toBe(a.id);
  });
});
