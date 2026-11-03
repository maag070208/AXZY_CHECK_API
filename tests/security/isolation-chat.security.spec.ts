/**
 * Multicliente, fase 5 · chat del equipo: cada cliente tiene su propio canal.
 *
 * El mensaje se guarda con el cliente del alcance y el historial solo muestra los mensajes de ese cliente. Sin
 * cliente en el alcance (administrador de una organización con varios clientes sin `X-Client-Id`) responde 403,
 * igual que la regla general de `scopeByClient`.
 */
import request from "supertest";
import { app } from "@src/app";
import { publishToChannel } from "@src/core/config/ably";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

// El push en vivo se publica por Ably: aquí se captura para comprobar el canal del cliente.
jest.mock("@src/core/config/ably", () => {
  const actual = jest.requireActual("@src/core/config/ably");
  return { ...actual, publishToChannel: jest.fn(async () => undefined) };
});

const V1 = "/api/v1";
const C = `${V1}/chat/messages`;
const publishMock = publishToChannel as jest.Mock;

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
  /** Encabezados del administrador eligiendo cliente con X-Client-Id. */
  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });
  return { a, b, admin, guardA, guardB, asAdmin };
};

describe("chat del equipo · aislamiento por cliente", () => {
  it("el mensaje se guarda con el cliente del alcance y solo lo ve ese cliente", async () => {
    const { a, b, guardA, guardB, asAdmin } = await setup();

    const created = await request(app).post(C).set(bearer(guardA)).send({ message: "hola A" });
    expect(created.status).toBe(201);
    expect((await prisma.chatMessage.findUniqueOrThrow({ where: { id: created.body.data.id } })).clientId).toBe(a.id);

    // Push en vivo: solo al canal del cliente del mensaje, nunca al canal global ni al de otro cliente.
    expect(publishMock).toHaveBeenCalledWith(`chat:team:${a.id}`, "new-message", expect.objectContaining({ message: "hola A" }));
    const channels = publishMock.mock.calls.map(([channel]) => channel);
    expect(channels).toEqual([`chat:team:${a.id}`]);
    expect(channels).not.toContain("chat:team");
    expect(channels).not.toContain(`chat:team:${b.id}`);
    // El payload publicado no expone el clientId interno.
    expect(publishMock.mock.calls[0][2]).not.toHaveProperty("clientId");

    expect((await request(app).get(C).set(bearer(guardA))).body.data.map((row: any) => row.message)).toEqual(["hola A"]);
    expect((await request(app).get(C).set(bearer(guardB))).body.data).toEqual([]);

    // El administrador ve el canal del cliente elegido, no el del otro.
    expect((await request(app).get(C).set(asAdmin(a.id))).body.data.map((row: any) => row.message)).toEqual(["hola A"]);
    expect((await request(app).get(C).set(asAdmin(b.id))).body.data).toEqual([]);

    // B escribe en su canal y A no lo ve; el push va al canal de B, nunca al de A.
    expect((await request(app).post(C).set(bearer(guardB)).send({ message: "hola B" })).status).toBe(201);
    expect(publishMock).toHaveBeenLastCalledWith(`chat:team:${b.id}`, "new-message", expect.objectContaining({ message: "hola B" }));
    const channelsAfterB = publishMock.mock.calls.map(([channel]) => channel);
    expect(channelsAfterB.filter((channel) => channel === `chat:team:${a.id}`)).toHaveLength(1);
    expect((await request(app).get(C).set(bearer(guardA))).body.data.map((row: any) => row.message)).toEqual(["hola A"]);
    expect((await request(app).get(C).set(asAdmin(b.id))).body.data.map((row: any) => row.message)).toEqual(["hola B"]);
  });

  it("sin cliente en el alcance responde 403 al leer y al escribir, y no guarda nada", async () => {
    const { admin } = await setup();

    expect((await request(app).get(C).set(bearer(admin))).status).toBe(403);
    const write = await request(app).post(C).set(bearer(admin)).send({ message: "sin cliente" });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("CLIENT_SCOPE_REQUIRED");
    expect(await prisma.chatMessage.count()).toBe(0);
  });

  it("la paginación por cursor nunca mezcla mensajes de otro cliente", async () => {
    const { guardA, guardB } = await setup();

    for (const message of ["a1", "a2", "a3"]) {
      expect((await request(app).post(C).set(bearer(guardA)).send({ message })).status).toBe(201);
    }
    for (const message of ["b1", "b2"]) {
      expect((await request(app).post(C).set(bearer(guardB)).send({ message })).status).toBe(201);
    }

    const firstPageA = await request(app).get(`${C}?limit=2`).set(bearer(guardA));
    expect(firstPageA.body.data.map((row: any) => row.message)).toEqual(["a3", "a2"]);
    const olderA = await request(app).get(`${C}?limit=10&cursor=${firstPageA.body.data[1].id}`).set(bearer(guardA));
    expect(olderA.body.data.map((row: any) => row.message)).toEqual(["a1"]);

    const allB = await request(app).get(`${C}?limit=10`).set(bearer(guardB));
    expect(allB.body.data.map((row: any) => row.message)).toEqual(["b2", "b1"]);
  });

  it("GET /users/me expone el alcance de la sesión para suscribirse al canal del cliente", async () => {
    const { a, b, guardA, guardB, admin } = await setup();

    const meA = await request(app).get("/api/v1/users/me").set(bearer(guardA));
    expect(meA.status).toBe(200);
    expect(meA.body.data).toMatchObject({ id: guardA.id, role: "GUARD", clientId: a.id });
    expect(meA.body.data.organizationId).toBeGreaterThan(0);

    expect((await request(app).get("/api/v1/users/me").set(bearer(guardB))).body.data.clientId).toBe(b.id);

    // El administrador de una organización con varios clientes no tiene cliente fijo hasta elegirlo.
    const meAdmin = await request(app).get("/api/v1/users/me").set(bearer(admin));
    expect(meAdmin.body.data.clientId).toBeNull();
    expect(meAdmin.body.data.organizationId).toBe(meA.body.data.organizationId);
  });
});
