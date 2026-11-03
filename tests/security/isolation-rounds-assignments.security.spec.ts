/**
 * Multicliente, fase 2 · rondas, asignaciones y bitácora (kardex): el cliente A no ve ni toca datos del cliente B.
 * Una organización COMPANY con dos clientes; el administrador elige con X-Client-Id y cada guardia trabaja en el
 * cliente de su asignación.
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

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  const locationA = await prisma.location.create({ data: { clientId: a.id, aisle: "A", spot: "1", number: "1", name: "Caseta A" } });
  const locationB = await prisma.location.create({ data: { clientId: b.id, aisle: "B", spot: "1", number: "1", name: "Caseta B" } });
  const routeA = await prisma.recurringConfiguration.create({
    data: { clientId: a.id, title: "Ruta A", guards: { connect: [{ id: guardA.id }] }, recurringLocations: { create: [{ locationId: locationA.id }] } },
  });
  const roundA = await prisma.round.create({ data: { clientId: a.id, guardId: guardA.id, recurringConfigurationId: routeA.id, status: "IN_PROGRESS" } });
  const assignmentA = await prisma.assignment.create({
    data: { clientId: a.id, guardId: guardA.id, locationId: locationA.id, assignedBy: admin.id, tasks: { create: [{ description: "Revisar" }] } },
    include: { tasks: true },
  });
  const scanA = await prisma.kardex.create({ data: { clientId: a.id, userId: guardA.id, locationId: locationA.id, notes: "A", clientRef: "scan-a" } });
  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });
  return { a, b, admin, guardA, guardB, locationA, locationB, routeA, roundA, assignmentA, scanA, asAdmin };
};

/** Pasa al guardia al cliente indicado: cierra su asignación y abre otra. */
const moveGuard = async (guardId: number, clientId: number) => {
  await prisma.guardAssignment.updateMany({ where: { guardId, endsAt: null }, data: { endsAt: new Date() } });
  await prisma.guardAssignment.create({ data: { guardId, clientId, startsAt: new Date() } });
};

describe("rondas · aislamiento por cliente", () => {
  it("historial, datatable y detalle solo del cliente elegido", async () => {
    const { a, b, roundA, asAdmin } = await setup();

    expect((await request(app).get(`${V1}/rounds`).set(asAdmin(a.id))).body.data.map((r: any) => r.id)).toEqual([roundA.id]);
    expect((await request(app).get(`${V1}/rounds`).set(asAdmin(b.id))).body.data).toEqual([]);
    expect((await request(app).post(`${V1}/rounds/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 })).body.data).toMatchObject({ rows: [], total: 0 });
    expect((await request(app).get(`${V1}/rounds/${roundA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/rounds/${roundA.id}`).set(asAdmin(a.id))).status).toBe(200);
  });

  it("desde el cliente B no se cierra una ronda de A", async () => {
    const { b, roundA, asAdmin } = await setup();
    const res = await request(app).put(`${V1}/rounds/${roundA.id}/end`).set(asAdmin(b.id)).send({});
    expect(res.status).toBe(400);
    expect((await prisma.round.findUniqueOrThrow({ where: { id: roundA.id } })).status).toBe("IN_PROGRESS");
  });

  it("guardia que pasa de A a B: no ve la ronda de A, no puede iniciar la ruta de A, y su ronda abierta en A se cierra al iniciar en B", async () => {
    const { b, guardA, routeA, roundA } = await setup();
    await moveGuard(guardA.id, b.id);

    expect((await request(app).get(`${V1}/rounds/current`).set(bearer(guardA))).body.data).toBeNull();
    const withRouteA = await request(app).post(`${V1}/rounds/start`).set(bearer(guardA)).send({ recurringConfigId: routeA.id, confirmed: true });
    expect(withRouteA.status).toBe(400);

    const generic = await request(app).post(`${V1}/rounds/start`).set(bearer(guardA)).send({ confirmed: true });
    expect(generic.status).toBe(200);
    expect(generic.body.data.clientId).toBe(b.id);
    expect((await prisma.round.findUniqueOrThrow({ where: { id: roundA.id } })).status).toBe("COMPLETED");
  });

  it("sincronización: las rondas activas de otros guardias son solo del mismo cliente y el snapshot trae su cliente", async () => {
    const { b, guardB } = await setup();
    const res = await request(app).get(`${V1}/sync/pull`).set(bearer(guardB));
    expect(res.status).toBe(200);
    expect(res.body.data.client).toMatchObject({ id: b.id });
    expect(JSON.stringify(res.body.data)).not.toContain("Ruta A");
  });
});

describe("asignaciones · aislamiento por cliente", () => {
  it("listado y datatable solo del cliente elegido", async () => {
    const { a, b, assignmentA, asAdmin } = await setup();
    expect((await request(app).get(`${V1}/assignments`).set(asAdmin(a.id))).body.data.map((x: any) => x.id)).toEqual([assignmentA.id]);
    expect((await request(app).get(`${V1}/assignments`).set(asAdmin(b.id))).body.data).toEqual([]);
    expect((await request(app).post(`${V1}/assignments/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 })).body.data).toMatchObject({ rows: [], total: 0 });
  });

  it("en B no se asigna a un guardia de A (400) ni una ubicación de A (404)", async () => {
    const { b, guardA, guardB, locationA, locationB, asAdmin } = await setup();
    expect((await request(app).post(`${V1}/assignments`).set(asAdmin(b.id)).send({ guardId: guardA.id, locationId: locationB.id })).status).toBe(400);
    expect((await request(app).post(`${V1}/assignments`).set(asAdmin(b.id)).send({ guardId: guardB.id, locationId: locationA.id })).status).toBe(404);

    const ok = await request(app).post(`${V1}/assignments`).set(asAdmin(b.id)).send({ guardId: guardB.id, locationId: locationB.id });
    expect(ok.status).toBe(201);
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: ok.body.data.id } })).clientId).toBe(b.id);
  });

  it("desde B no se cambia el estado de una asignación de A ni se marca su tarea (404)", async () => {
    const { b, guardB, assignmentA, asAdmin } = await setup();
    expect((await request(app).patch(`${V1}/assignments/${assignmentA.id}/status`).set(asAdmin(b.id)).send({ status: "CHECKING" })).status).toBe(404);
    expect((await request(app).patch(`${V1}/assignments/tasks/${assignmentA.tasks[0].id}/toggle`).set(asAdmin(b.id)).send({ completed: true })).status).toBe(404);
    expect((await request(app).patch(`${V1}/assignments/tasks/${assignmentA.tasks[0].id}/toggle`).set(bearer(guardB)).send({ completed: true })).status).toBe(404);
    expect(await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentA.id } })).toMatchObject({ status: "PENDING" });
    expect((await prisma.assignmentTask.findUniqueOrThrow({ where: { id: assignmentA.tasks[0].id } })).completed).toBe(false);
  });

  it("mis asignaciones: el guardia que pasó a B ya no ve las de A", async () => {
    const { b, guardA } = await setup();
    await moveGuard(guardA.id, b.id);
    expect((await request(app).get(`${V1}/assignments/me`).set(bearer(guardA))).body.data).toEqual([]);
  });
});

describe("bitácora (kardex) · aislamiento por cliente", () => {
  it("listado, datatable y detalle solo del cliente elegido", async () => {
    const { a, b, scanA, asAdmin } = await setup();
    expect((await request(app).get(`${V1}/kardex`).set(asAdmin(a.id))).body.data.map((k: any) => k.id)).toEqual([scanA.id]);
    expect((await request(app).get(`${V1}/kardex`).set(asAdmin(b.id))).body.data).toEqual([]);
    expect((await request(app).post(`${V1}/kardex/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 })).body.data).toMatchObject({ data: [], total: 0 });
    expect((await request(app).get(`${V1}/kardex/${scanA.id}`).set(asAdmin(b.id))).status).toBe(404);
  });

  it("desde B no se edita, borra ni quita evidencia de un registro de A (404)", async () => {
    const { b, scanA, asAdmin } = await setup();
    expect((await request(app).patch(`${V1}/kardex/${scanA.id}`).set(asAdmin(b.id)).send({ notes: "tomado" })).status).toBe(404);
    expect((await request(app).delete(`${V1}/kardex/${scanA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).delete(`${V1}/kardex/${scanA.id}/media`).query({ key: "x" }).set(asAdmin(b.id))).status).toBe(404);
    expect(await prisma.kardex.findUniqueOrThrow({ where: { id: scanA.id } })).toMatchObject({ notes: "A" });
  });

  it("el guardia de B no escanea una ubicación de A (400, como una inexistente); en la suya el registro queda en B", async () => {
    const { b, guardB, locationA, locationB } = await setup();
    expect((await request(app).post(`${V1}/kardex`).set(bearer(guardB)).send({ userId: guardB.id, locationId: locationA.id })).status).toBe(400);
    expect(await prisma.kardex.count({ where: { locationId: locationA.id, userId: guardB.id } })).toBe(0);

    const ok = await request(app).post(`${V1}/kardex`).set(bearer(guardB)).send({ userId: guardB.id, locationId: locationB.id });
    expect(ok.status).toBe(201);
    expect((await prisma.kardex.findUniqueOrThrow({ where: { id: ok.body.data.id } })).clientId).toBe(b.id);
  });

  it("reintento offline con la clave de un registro de A desde B: 409, no devuelve el de A", async () => {
    const { b, guardA, locationB } = await setup();
    await moveGuard(guardA.id, b.id);
    const res = await request(app).post(`${V1}/kardex`).set(bearer(guardA)).send({ userId: guardA.id, locationId: locationB.id, clientRef: "scan-a" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('"notes":"A"');
  });

  it("no se registra un escaneo en una ronda de otro cliente", async () => {
    const { b, guardA, locationB, roundA } = await setup();
    await moveGuard(guardA.id, b.id);
    const res = await request(app).post(`${V1}/kardex`).set(bearer(guardA)).send({ userId: guardA.id, locationId: locationB.id, roundId: roundA.id });
    expect(res.status).toBe(403);
  });
});
