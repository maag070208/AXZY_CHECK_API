/**
 * Multicliente, fase 2 · accesos e invitaciones: el cliente A no ve ni toca datos del cliente B.
 *
 * Cubre invitaciones (pases de visita y visitas sin cita), vehículos/tags, pases QR y PIN, bitácora de
 * accesos con sus exportaciones, personas autorizadas y excepciones de adeudo. La organización es COMPANY
 * con dos clientes; el administrador elige con `X-Client-Id` y cada guardia trabaja en el cliente de su
 * asignación. Los recursos llegan al cliente por su propiedad.
 */
import ExcelJS from "exceljs";
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

const V1 = "/api/v1";
const HOUR = 3600_000;

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });

const makeProperty = async (identifier: string, clientId: number) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: { clientId, identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  await prisma.occupancyPeriod.create({ data: { propertyId: property.id, statusId: vacant.id, startDate: new Date() } });
  return property;
};

/** Residente activo de una casa, con `User.propertyId` (de ahí sale el cliente de su token) y vínculo canónico. */
const makeResident = async (propertyId: number, organizationId: number, clientId: number) => {
  const user = await buildUser("RESDN", { scope: { organizationId, clientId: null } });
  await prisma.user.update({ where: { id: user.id }, data: { propertyId } });
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id, clientId } });
  await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, person, auth: bearer(user) };
};

const invitationTypeId = async () => (await prisma.invitationType.findUniqueOrThrow({ where: { name: "VISITOR" } })).id;

const makeInvitation = async (propertyId: number, createdById: number, code: string) =>
  prisma.invitation.create({
    data: {
      code,
      guestName: `Visita ${code}`,
      createdById,
      propertyId,
      typeId: await invitationTypeId(),
      validFrom: new Date(Date.now() - HOUR),
      validUntil: new Date(Date.now() + 4 * HOUR),
    },
  });

const makeVehicle = (propertyId: number, ownerId: number, plate: string, tagCode: string | null, clientId: number, status: "APPROVED" | "PENDING" = "APPROVED") =>
  prisma.vehicle.create({
    data: { propertyId, clientId, ownerId, plate, plateNormalized: plate.replace(/[^A-Z0-9]/gi, "").toUpperCase(), tagCode, status },
  });

const downloadBinary = (url: string, auth: Record<string, string>) =>
  request(app)
    .get(url)
    .set(auth)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  const propertyA = await makeProperty("PROP-A", a.id);
  const propertyB = await makeProperty("PROP-B", b.id);
  const residentA = await makeResident(propertyA.id, organization.id, a.id);
  const residentB = await makeResident(propertyB.id, organization.id, b.id);
  const invitationA = await makeInvitation(propertyA.id, residentA.user.id, "AXZ-ISOA01");
  const invitationB = await makeInvitation(propertyB.id, residentB.user.id, "AXZ-ISOB01");
  const vehicleA = await makeVehicle(propertyA.id, residentA.user.id, "AAA-111", "TAG-ISO-A", a.id);
  const vehicleB = await makeVehicle(propertyB.id, residentB.user.id, "BBB-222", "TAG-ISO-B", b.id);
  /** Encabezados del administrador eligiendo cliente con X-Client-Id. */
  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });
  return {
    a,
    b,
    admin,
    guardA,
    guardB,
    propertyA,
    propertyB,
    residentA,
    residentB,
    invitationA,
    invitationB,
    vehicleA,
    vehicleB,
    asAdmin,
  };
};

describe("invitaciones · aislamiento por cliente", () => {
  it("el datatable y el detalle solo muestran invitaciones del cliente elegido", async () => {
    const { a, b, invitationA, invitationB, asAdmin } = await setup();

    const rowsA = await request(app).post(`${V1}/invitations/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 10 });
    expect(rowsA.body.data.rows.map((row: any) => row.id)).toEqual([invitationA.id]);
    const rowsB = await request(app).post(`${V1}/invitations/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 });
    expect(rowsB.body.data.rows.map((row: any) => row.id)).toEqual([invitationB.id]);

    expect((await request(app).get(`${V1}/invitations/${invitationA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/invitations/AXZ-ISOA01`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/invitations/${invitationA.id}`).set(asAdmin(a.id))).status).toBe(200);
  });

  it("desde B no se registra la entrada/salida ni se revoca una invitación de A (404)", async () => {
    const { b, invitationA, asAdmin } = await setup();

    expect((await request(app).put(`${V1}/invitations/${invitationA.id}/status`).set(asAdmin(b.id)).send({ status: "ENTERED" })).status).toBe(404);
    expect((await request(app).put(`${V1}/invitations/${invitationA.id}/status`).set(asAdmin(b.id)).send({ status: "CANCELLED", reason: "otro cliente" })).status).toBe(404);
    expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invitationA.id } })).toMatchObject({ status: "PENDING", revokedAt: null });
  });

  it("el guardia de B no lee ni mueve el pase de A; el de A sí (y queda en la bitácora de A)", async () => {
    const { guardA, guardB, invitationA } = await setup();

    expect((await request(app).post(`${V1}/invitations/scan`).set(bearer(guardB)).send({ code: "AXZ-ISOA01" })).status).toBe(404);
    expect((await request(app).put(`${V1}/invitations/${invitationA.id}/status`).set(bearer(guardB)).send({ status: "ENTERED" })).status).toBe(404);

    expect((await request(app).post(`${V1}/invitations/scan`).set(bearer(guardA)).send({ code: "AXZ-ISOA01" })).status).toBe(200);
    expect((await request(app).put(`${V1}/invitations/${invitationA.id}/status`).set(bearer(guardA)).send({ status: "ENTERED" })).status).toBe(200);
    const event = await prisma.accessEvent.findFirstOrThrow({ where: { invitationId: invitationA.id } });
    expect(event).toMatchObject({ decision: "ALLOWED", propertyId: invitationA.propertyId });
  });

  it("dar de alta con una propiedad de A desde B es 400 (referencia ajena); en el propio cliente se crea", async () => {
    const { a, b, propertyA, propertyB, asAdmin, guardB } = await setup();
    const typeId = await invitationTypeId();
    const body = (propertyId: number) => ({
      guestName: "Visita nueva",
      propertyId,
      typeId,
      validFrom: new Date(Date.now() - HOUR).toISOString(),
      validUntil: new Date(Date.now() + 2 * HOUR).toISOString(),
    });

    const cross = await request(app).post(`${V1}/invitations`).set(asAdmin(b.id)).send(body(propertyA.id));
    expect(cross.status).toBe(400);
    expect(cross.body.code).toBe("PROPERTY_OUT_OF_CLIENT");
    expect(await prisma.invitation.count({ where: { propertyId: propertyA.id } })).toBe(1);

    const own = await request(app).post(`${V1}/invitations`).set(asAdmin(b.id)).send(body(propertyB.id));
    expect(own.status).toBe(201);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: own.body.data.id } })).propertyId).toBe(propertyB.id);

    // Visita sin cita creada por caseta: la propiedad debe ser del cliente del guardia.
    const walkIn = { ...body(propertyA.id), walkIn: true };
    expect((await request(app).post(`${V1}/invitations`).set(bearer(guardB)).send(walkIn)).status).toBe(400);
    expect((await request(app).post(`${V1}/invitations`).set(bearer(guardB)).send({ ...walkIn, propertyId: propertyB.id })).status).toBe(201);
    expect((await request(app).post(`${V1}/invitations`).set(asAdmin(a.id)).send(body(propertyA.id))).status).toBe(201);
  });

  it("los indicadores y sus exportaciones solo agregan datos del cliente del alcance", async () => {
    const { a, b, guardA, invitationA, asAdmin } = await setup();
    await request(app).put(`${V1}/invitations/${invitationA.id}/status`).set(bearer(guardA)).send({ status: "ENTERED" });
    const from = new Date(Date.now() - 24 * HOUR).toISOString();
    const to = new Date(Date.now() + HOUR).toISOString();

    const statsA = await request(app).get(`${V1}/invitations/stats`).query({ from, to }).set(asAdmin(a.id));
    const statsB = await request(app).get(`${V1}/invitations/stats`).query({ from, to }).set(asAdmin(b.id));
    expect(statsA.status).toBe(200);
    expect(statsB.status).toBe(200);
    expect(statsA.body.data.byProperty.map((row: any) => row.identifier)).toContain("PROP-A");
    expect(statsB.body.data.byProperty.map((row: any) => row.identifier)).not.toContain("PROP-A");

    const file = await downloadBinary(`${V1}/invitations/stats/export.xlsx?from=${from}&to=${to}`, asAdmin(b.id));
    expect(file.status).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.body as ArrayBuffer);
    const summary = book.getWorksheet("Resumen")!;
    expect(summary.getRow(4).values).toEqual([undefined, "Entradas", 0]);
    expect(book.getWorksheet("Por casa")!.rowCount).toBe(1);
  });
});

describe("vehículos y bitácora · aislamiento por cliente", () => {
  it("listado, búsqueda en caseta y aprobación solo del cliente elegido", async () => {
    const { a, b, vehicleA, vehicleB, asAdmin, guardA, guardB } = await setup();

    expect((await request(app).get(`${V1}/vehicles`).set(asAdmin(a.id))).body.data.items.map((row: any) => row.id)).toEqual([vehicleA.id]);
    expect((await request(app).get(`${V1}/vehicles`).set(asAdmin(b.id))).body.data.items.map((row: any) => row.id)).toEqual([vehicleB.id]);

    expect((await request(app).get(`${V1}/vehicles/lookup?q=TAG-ISO-A`).set(bearer(guardB))).body.data).toEqual([]);
    expect((await request(app).get(`${V1}/vehicles/lookup?q=TAG-ISO-A`).set(bearer(guardA))).body.data).toHaveLength(1);

    expect((await request(app).patch(`${V1}/vehicles/${vehicleA.id}/approve`).set(asAdmin(b.id)).send({})).status).toBe(404);
    expect((await request(app).delete(`${V1}/vehicles/${vehicleA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleA.id } })).toMatchObject({ active: true, tagCode: "TAG-ISO-A" });
  });

  it("la caseta de B no registra el acceso de un vehículo de A (404); la de A sí", async () => {
    const { a, b, vehicleA, guardA, guardB, asAdmin } = await setup();

    expect((await request(app).post(`${V1}/vehicles/${vehicleA.id}/access`).set(bearer(guardB)).send({ direction: "ENTRY" })).status).toBe(404);
    expect(await prisma.accessEvent.count({ where: { vehicleId: vehicleA.id } })).toBe(0);

    expect((await request(app).post(`${V1}/vehicles/${vehicleA.id}/access`).set(bearer(guardA)).send({ direction: "ENTRY" })).status).toBe(200);
    expect((await request(app).get(`${V1}/access/events`).set(asAdmin(b.id))).body.data.total).toBe(0);
    expect((await request(app).get(`${V1}/access/events`).set(asAdmin(a.id))).body.data.total).toBe(1);
  });

  it("el estado de acceso de una propiedad de A no se consulta desde B (404)", async () => {
    const { propertyA, propertyB, guardA, guardB } = await setup();
    expect((await request(app).get(`${V1}/access/status?propertyId=${propertyA.id}`).set(bearer(guardB))).status).toBe(404);
    expect((await request(app).get(`${V1}/access/status?propertyId=${propertyA.id}`).set(bearer(guardA))).status).toBe(200);
    expect((await request(app).get(`${V1}/access/status?propertyId=${propertyB.id}`).set(bearer(guardB))).status).toBe(200);
  });

  it("la bitácora y su exportación CSV solo traen eventos del cliente del alcance", async () => {
    const { a, b, invitationA, guardA, asAdmin } = await setup();
    await request(app).put(`${V1}/invitations/${invitationA.id}/status`).set(bearer(guardA)).send({ status: "ENTERED" });

    const eventsB = await request(app).get(`${V1}/access/events`).set(asAdmin(b.id));
    expect(eventsB.body.data).toMatchObject({ total: 0, items: [] });
    const eventsA = await request(app).get(`${V1}/access/events`).set(asAdmin(a.id));
    expect(eventsA.body.data.total).toBe(1);

    const csvB = await request(app).get(`${V1}/access/events/export.csv`).set(asAdmin(b.id));
    expect(csvB.status).toBe(200);
    expect(csvB.text).not.toContain("PROP-A");
    const csvA = await request(app).get(`${V1}/access/events/export.csv`).set(asAdmin(a.id));
    expect(csvA.text).toContain("PROP-A");
  });

  it("las excepciones de adeudo no se crean, listan ni revocan desde el otro cliente", async () => {
    const { a, b, propertyA, asAdmin } = await setup();
    const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString().slice(0, 10);

    const exception = await request(app)
      .post(`${V1}/access/exceptions`)
      .set(asAdmin(a.id))
      .send({ propertyId: propertyA.id, reason: "Convenio temporal", validUntil: tomorrow });
    expect(exception.status).toBe(201);

    expect((await request(app).get(`${V1}/access/exceptions`).set(asAdmin(b.id))).body.data).toEqual([]);
    expect((await request(app).delete(`${V1}/access/exceptions/${exception.body.data.id}`).set(asAdmin(b.id))).status).toBe(404);
    const cross = await request(app)
      .post(`${V1}/access/exceptions`)
      .set(asAdmin(b.id))
      .send({ propertyId: propertyA.id, reason: "Convenio ajeno", validUntil: tomorrow });
    expect(cross.status).toBe(400);
    expect(cross.body.code).toBe("PROPERTY_OUT_OF_CLIENT");
    expect((await prisma.accessException.findUniqueOrThrow({ where: { id: exception.body.data.id } })).revokedAt).toBeNull();
  });

  it("el MISMO tag se puede asignar en dos clientes; repetirlo dentro del mismo cliente es 409", async () => {
    const { a, b, propertyA, propertyB, residentA, residentB, asAdmin } = await setup();
    const pendingA = await makeVehicle(propertyA.id, residentA.user.id, "PEND-A", null, a.id, "PENDING");
    const pendingB = await makeVehicle(propertyB.id, residentB.user.id, "PEND-B", null, b.id, "PENDING");

    expect((await request(app).patch(`${V1}/vehicles/${pendingA.id}/approve`).set(asAdmin(a.id)).send({ tagCode: "SHARED-1" })).status).toBe(200);
    expect((await request(app).patch(`${V1}/vehicles/${pendingB.id}/approve`).set(asAdmin(b.id)).send({ tagCode: "SHARED-1" })).status).toBe(200);
    const tagged = await prisma.vehicle.findMany({ where: { tagCode: "SHARED-1" }, orderBy: { clientId: "asc" } });
    expect(tagged.map((row) => row.clientId)).toEqual([a.id, b.id]);
    expect(tagged.map((row) => row.tagCode)).toEqual(["SHARED-1", "SHARED-1"]);

    // Dentro del cliente A el tag ya está ocupado: 409.
    const pendingA2 = await makeVehicle(propertyA.id, residentA.user.id, "PEND-A2", null, a.id, "PENDING");
    const duplicate = await request(app).patch(`${V1}/vehicles/${pendingA2.id}/approve`).set(asAdmin(a.id)).send({ tagCode: "SHARED-1" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("VEHICLE_TAG_DUPLICATE");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: pendingA2.id } })).status).toBe("PENDING");
  });
});

describe("PIN y QR personal · aislamiento por cliente", () => {
  it("el guardia de B no valida el PIN de un residente de A; el de A sí", async () => {
    const { residentA, guardA, guardB } = await setup();
    const created = await request(app).post(`${V1}/access-pins/me`).set(residentA.auth).send({ pin: "314159" });
    expect(created.status).toBe(201);

    const fromB = await request(app).post(`${V1}/access-pins/validate`).set(bearer(guardB)).send({ pin: "314159" });
    expect(fromB.body.data).toEqual({ valid: false, reason: "INVALID_PIN" });
    expect(await prisma.accessEvent.count({ where: { method: "PIN" } })).toBe(0);

    const fromA = await request(app).post(`${V1}/access-pins/validate`).set(bearer(guardA)).send({ pin: "314159" });
    expect(fromA.body.data).toMatchObject({ valid: true, property: { identifier: "PROP-A" } });
  });

  it("el guardia de B no valida el pase QR de un residente de A; el de A sí", async () => {
    const { residentA, guardA, guardB } = await setup();
    const issued = await request(app).post(`${V1}/access-pins/me/qr/token`).set(residentA.auth);
    expect(issued.status).toBe(200);

    const fromB = await request(app).post(`${V1}/access-pins/pass/validate`).set(bearer(guardB)).send({ token: issued.body.data.token });
    expect(fromB.body.data).toEqual({ valid: false, reason: "INVALID_QR" });

    const fromA = await request(app).post(`${V1}/access-pins/pass/validate`).set(bearer(guardA)).send({ token: issued.body.data.token });
    expect(fromA.body.data).toMatchObject({ valid: true, property: { identifier: "PROP-A" } });
    expect((await prisma.accessEvent.findFirstOrThrow({ where: { method: "QR", decision: "ALLOWED" } })).propertyId).toBeGreaterThan(0);
  });

  it("el MISMO PIN se puede crear en dos clientes y cada caseta valida el suyo", async () => {
    const { a, b, residentA, residentB, guardA, guardB } = await setup();
    const pin = "246810";

    expect((await request(app).post(`${V1}/access-pins/me`).set(residentA.auth).send({ pin })).status).toBe(201);
    expect((await request(app).post(`${V1}/access-pins/me`).set(residentB.auth).send({ pin })).status).toBe(201);

    const rows = await prisma.accessPin.findMany({ where: { active: true, clientId: { in: [a.id, b.id] } }, orderBy: { clientId: "asc" } });
    expect(rows).toHaveLength(2);
    // Mismo hash, clientes distintos: el único es por cliente.
    expect(rows[0].pinHash).toBe(rows[1].pinHash);
    expect(rows.map((row) => row.clientId).sort()).toEqual([a.id, b.id].sort());

    expect((await request(app).post(`${V1}/access-pins/validate`).set(bearer(guardA)).send({ pin })).body.data).toMatchObject({
      valid: true,
      property: { identifier: "PROP-A" },
    });
    expect((await request(app).post(`${V1}/access-pins/validate`).set(bearer(guardB)).send({ pin })).body.data).toMatchObject({
      valid: true,
      property: { identifier: "PROP-B" },
    });
  });
});

describe("residente de A · solo ve y opera lo suyo", () => {
  it("lista solo sus invitaciones y ve solo sus vehículos", async () => {
    const { propertyB, residentA, residentB } = await setup();

    const own = await request(app).post(`${V1}/invitations/datatable`).set(residentA.auth).send({ page: 1, limit: 10 });
    expect(own.status).toBe(200);
    expect(own.body.data.rows.map((row: any) => row.code)).toEqual(["AXZ-ISOA01"]);

    // Aunque el cuerpo pida la propiedad del otro cliente, el servidor impone el creador y el alcance.
    const sneaky = await request(app).post(`${V1}/invitations/datatable`).set(residentA.auth).send({ page: 1, limit: 10, filters: { propertyId: propertyB.id } });
    expect(sneaky.body.data.rows).toEqual([]);

    expect((await request(app).get(`${V1}/vehicles/me`).set(residentA.auth)).body.data.map((row: any) => row.plate)).toEqual(["AAA-111"]);
    expect((await request(app).get(`${V1}/vehicles/me`).set(residentB.auth)).body.data.map((row: any) => row.plate)).toEqual(["BBB-222"]);
  });

  it("no consulta ni revoca el pase de otro cliente ni invita para su propiedad", async () => {
    const { propertyB, invitationB, residentA } = await setup();
    const typeId = await invitationTypeId();

    expect([403, 404]).toContain((await request(app).get(`${V1}/invitations/${invitationB.id}`).set(residentA.auth)).status);
    expect([403, 404]).toContain(
      (await request(app).put(`${V1}/invitations/${invitationB.id}/status`).set(residentA.auth).send({ status: "CANCELLED", reason: "ajena" })).status,
    );
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationB.id } })).status).toBe("PENDING");

    const cross = await request(app)
      .post(`${V1}/invitations`)
      .set(residentA.auth)
      .send({
        guestName: "Visita a otra casa",
        propertyId: propertyB.id,
        typeId,
        validFrom: new Date(Date.now() - HOUR).toISOString(),
        validUntil: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(cross.status).toBe(403);
    expect(await prisma.invitation.count({ where: { propertyId: propertyB.id } })).toBe(1);
  });
});

describe("personas autorizadas · aislamiento por cliente", () => {
  const authorizationBody = (personId: number) => ({
    personId,
    scope: "PEDESTRIAN",
    days: [0, 1, 2, 3, 4, 5, 6],
    startTime: "00:00",
    endTime: "23:59",
    validFrom: "2026-01-01",
  });

  it("desde B no se crea ni consulta una autorización de A (404) ni se emite su pase", async () => {
    const { a, b, propertyA, guardA, guardB, asAdmin } = await setup();
    const visitor = await prisma.person.create({ data: { firstName: "Jardinero", clientId: a.id } });

    const created = await request(app)
      .post(`${V1}/properties/${propertyA.id}/authorizations`)
      .set(asAdmin(a.id))
      .send(authorizationBody(visitor.id));
    expect(created.status).toBe(201);
    const authorizationId = created.body.data.id;

    const crossCreate = await request(app)
      .post(`${V1}/properties/${propertyA.id}/authorizations`)
      .set(asAdmin(b.id))
      .send(authorizationBody(visitor.id));
    expect(crossCreate.status).toBe(404);

    const check = (guard: Record<string, string>) =>
      request(app).get(`${V1}/authorizations/check?propertyId=${propertyA.id}&personId=${visitor.id}`).set(guard);
    expect((await check(bearer(guardB))).status).toBe(404);
    expect((await check(bearer(guardA))).body.data).toEqual({ decision: "AUTHORIZED", reason: "IN_SCHEDULE" });

    expect((await request(app).post(`${V1}/authorizations/${authorizationId}/revoke`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).post(`${V1}/authorizations/${authorizationId}/pass`).set(asAdmin(b.id))).status).toBe(404);

    const issued = await request(app).post(`${V1}/authorizations/${authorizationId}/pass`).set(asAdmin(a.id));
    expect(issued.status).toBe(201);
    const verifyFromB = await request(app)
      .post(`${V1}/authorizations/pass/verify`)
      .set(bearer(guardB))
      .send({ token: issued.body.data.token });
    expect(verifyFromB.body.data).toEqual({ decision: "DENIED", reason: "UNKNOWN_PASS", person: null });
    const verifyFromA = await request(app)
      .post(`${V1}/authorizations/pass/verify`)
      .set(bearer(guardA))
      .send({ token: issued.body.data.token });
    expect(verifyFromA.body.data).toMatchObject({ decision: "AUTHORIZED", person: { firstName: "Jardinero" } });
  });

  it("dar de alta con una persona que solo vive en A desde B es 400 (persona ajena)", async () => {
    const { b, propertyB, residentA, asAdmin } = await setup();

    const cross = await request(app)
      .post(`${V1}/properties/${propertyB.id}/authorizations`)
      .set(asAdmin(b.id))
      .send(authorizationBody(residentA.person.id));
    expect(cross.status).toBe(400);
    expect(cross.body.code).toBe("PERSON_OUT_OF_CLIENT");

    const visitor = await prisma.person.create({ data: { firstName: "Visita sin vínculo", clientId: b.id } });
    expect(
      (await request(app).post(`${V1}/properties/${propertyB.id}/authorizations`).set(asAdmin(b.id)).send(authorizationBody(visitor.id))).status,
    ).toBe(201);
  });
});
