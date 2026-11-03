/**
 * Fase 3 · administración de la organización: clientes y asignación de guardias a clientes.
 * El ADMIN de la empresa de seguridad crea clientes, mueve guardias entre ellos y la plantilla muestra
 * el cliente asignado. Al mover un guardia, su alcance se refresca en la siguiente petición.
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
  const guard = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: null } });
  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });
  return { organization, a, b, admin, guard, asAdmin };
};

describe("clientes de la organización", () => {
  it("el ADMIN lista, crea y desactiva clientes de su organización", async () => {
    const { a, b, asAdmin } = await setup();
    const list = await request(app).get(`${V1}/clients`).set(asAdmin(a.id));
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: any) => c.id).sort()).toEqual([a.id, b.id].sort());

    const created = await request(app).post(`${V1}/clients`).set(asAdmin(a.id)).send({ name: "Plaza Norte", type: "PLAZA" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Plaza Norte", type: "PLAZA", active: true });

    // Nombre repetido en la misma organización: 409 (no revela nada de otras organizaciones).
    expect((await request(app).post(`${V1}/clients`).set(asAdmin(a.id)).send({ name: "Plaza Norte", type: "PLAZA" })).status).toBe(409);

    const off = await request(app).patch(`${V1}/clients/${created.body.data.id}`).set(asAdmin(a.id)).send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.active).toBe(false);
  });

  it("no se tocan clientes de otra organización (404) ni se listan", async () => {
    const { a, asAdmin } = await setup();
    const other = await buildOrganization("COMPANY", 1);
    expect((await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: 1, clientId: other.clients[0].id })).status).toBe(400);
    expect((await request(app).patch(`${V1}/clients/${other.clients[0].id}`).set(asAdmin(a.id)).send({ active: false })).status).toBe(404);
    const list = await request(app).get(`${V1}/clients`).set(asAdmin(a.id));
    expect(list.body.data.map((c: any) => c.id)).not.toContain(other.clients[0].id);
  });

  it("un cliente con asignaciones no se borra: no hay endpoint de borrado, solo desactivar", async () => {
    const { a, asAdmin } = await setup();
    expect((await request(app).delete(`${V1}/clients/${a.id}`).set(asAdmin(a.id))).status).toBe(404);
  });
});

describe("asignación de guardias a clientes", () => {
  it("asigna un guardia, lo mueve de cliente y el alcance cambia en la siguiente petición", async () => {
    const { a, b, guard, asAdmin } = await setup();

    // Sin asignación no hay cliente: el guardia no ve datos de cliente todavía.
    const incidentA = await prisma.incident.create({ data: { clientId: a.id, guardId: guard.id, title: "A", kind: "INCIDENT" } });
    const incidentB = await prisma.incident.create({ data: { clientId: b.id, guardId: guard.id, title: "B", kind: "INCIDENT" } });
    expect((await request(app).get(`${V1}/incidents`).set(bearer(guard))).status).toBe(403);

    const first = await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: guard.id, clientId: a.id });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ guardId: guard.id, clientId: a.id, endsAt: null });
    expect((await request(app).get(`${V1}/incidents`).set(bearer(guard))).body.data.map((i: any) => i.id)).toEqual([incidentA.id]);

    // Mover a B cierra la asignación abierta y abre la nueva.
    const second = await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: guard.id, clientId: b.id });
    expect(second.status).toBe(201);
    const now = await prisma.guardAssignment.findMany({ where: { guardId: guard.id }, orderBy: { id: "asc" } });
    expect(now).toHaveLength(2);
    expect(now[0].endsAt).not.toBeNull();
    expect(now[1].endsAt).toBeNull();
    expect((await request(app).get(`${V1}/incidents`).set(bearer(guard))).body.data.map((i: any) => i.id)).toEqual([incidentB.id]);
  });

  it("no duplica la asignación abierta al mismo cliente (409) y termina la asignación", async () => {
    const { a, guard, asAdmin } = await setup();
    const created = await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: guard.id, clientId: a.id });
    expect(created.status).toBe(201);
    expect((await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: guard.id, clientId: a.id })).status).toBe(409);

    const ended = await request(app).post(`${V1}/guard-assignments/${created.body.data.id}/end`).set(asAdmin(a.id));
    expect(ended.status).toBe(200);
    expect(ended.body.data.endsAt).not.toBeNull();
    expect((await request(app).post(`${V1}/guard-assignments/${created.body.data.id}/end`).set(asAdmin(a.id))).status).toBe(400);
    // Terminada la asignación, el guardia vuelve a quedarse sin cliente.
    expect((await request(app).get(`${V1}/incidents`).set(bearer(guard))).status).toBe(403);
  });

  it("valida cliente y guardia de la organización", async () => {
    const { a, guard, asAdmin } = await setup();
    const other = await buildOrganization("COMPANY", 1);
    const otherGuard = await buildUser("GUARD", { scope: { organizationId: other.organization.id, clientId: null } });

    expect((await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: guard.id, clientId: other.clients[0].id })).status).toBe(400);
    expect((await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: otherGuard.id, clientId: a.id })).status).toBe(400);

    const list = await request(app).get(`${V1}/guard-assignments`).set(asAdmin(a.id));
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
  });

  it("la plantilla de usuarios muestra el cliente asignado y solo de la organización", async () => {
    const { a, guard, asAdmin } = await setup();
    await request(app).post(`${V1}/guard-assignments`).set(asAdmin(a.id)).send({ guardId: guard.id, clientId: a.id });

    const table = await request(app).post(`${V1}/users/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 30 });
    expect(table.status).toBe(200);
    const row = table.body.data.rows.find((r: any) => r.id === guard.id);
    expect(row.guardAssignment).toMatchObject({ clientId: a.id, client: { id: a.id } });

    const other = await buildOrganization("COMPANY", 1);
    const stranger = await buildUser("GUARD", { scope: { organizationId: other.organization.id, clientId: null } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: stranger.id } })).organizationId).toBe(other.organization.id);
    expect(table.body.data.rows.map((r: any) => r.id)).not.toContain(stranger.id);
  });
});
