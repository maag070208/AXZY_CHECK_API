/**
 * Tiempo real (Ably): con el servicio configurado el chat y los eventos operativos se publican,
 * el token de los clientes es solo de suscripción, y un fallo del proveedor nunca rompe la API.
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, Session, V1 } from "./support";

const publish = jest.fn();
const createTokenRequest = jest.fn();
const channelsGet = jest.fn(() => ({ publish }));

jest.mock("ably", () => ({
  __esModule: true,
  default: { Rest: jest.fn().mockImplementation(() => ({ channels: { get: channelsGet }, auth: { createTokenRequest } })) },
}));

let s: Record<string, Session>;

beforeAll(() => {
  process.env.ABLY_KEY = "clave.de:pruebas";
});
afterAll(async () => {
  process.env.ABLY_KEY = "";
  await disconnectDatabase();
});
beforeEach(async () => {
  await bootFlows();
  s = await allSessions();
  publish.mockReset().mockResolvedValue(undefined);
  createTokenRequest.mockReset().mockResolvedValue({ keyName: "clave.de", clientId: "user-x", mac: "firma" });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("token de suscripción", () => {
  it("entrega un token de solo lectura para los tres canales y sin la clave maestra", async () => {
    const res = await api().get(`${V1}/realtime/token`).set("Authorization", s.guard1.auth);
    const data = expectOk(res);
    expect(data).toMatchObject({ keyName: "clave.de" });
    expect(JSON.stringify(res.body)).not.toContain("pruebas");
    const options = createTokenRequest.mock.calls[0][0];
    expect(options.clientId).toBe(`user-${s.guard1.id}`);
    expect(Object.values(options.capability)).toEqual([["subscribe"], ["subscribe"], ["subscribe"]]);
  });

  it("si el proveedor falla responde 503 (el cliente cae a sondeo)", async () => {
    createTokenRequest.mockRejectedValueOnce(new Error("Ably caído"));
    expectFail(await api().get(`${V1}/realtime/token`).set("Authorization", s.guard1.auth), 503);
  });
});

describe("publicación de eventos", () => {
  it("un mensaje de chat se publica al canal del equipo", async () => {
    expectOk(await api().post(`${V1}/chat/messages`).set("Authorization", s.guard1.auth).send({ message: "Hola equipo" }), 201);
    await new Promise((r) => setTimeout(r, 50));
    expect(channelsGet).toHaveBeenCalledWith("chat:team");
    expect(publish).toHaveBeenCalledWith("new-message", expect.objectContaining({ message: "Hola equipo" }));
  });

  it("iniciar y terminar ronda, escanear, reportar y entregar turno refrescan el dashboard", async () => {
    const { prisma } = await import("./support");
    await prisma.round.updateMany({ data: { status: "COMPLETED" } });
    const round = expectOk(await api().post(`${V1}/rounds/start`).set("Authorization", s.guard1.auth).send({}));
    const location = await prisma.location.findFirstOrThrow();
    expectOk(await api().post(`${V1}/kardex`).set("Authorization", s.guard1.auth).send({ userId: s.guard1.id, locationId: location.id }), 201);
    expectOk(await api().post(`${V1}/incidents`).set("Authorization", s.guard1.auth).send({ title: "Aviso en vivo" }), 201);
    expectOk(await api().put(`${V1}/rounds/${round.id}/end`).set("Authorization", s.guard1.auth));
    expectOk(await api().post(`${V1}/shift-handover`).set("Authorization", s.shift.auth).send({ shiftType: "MATUTINO", handoverDate: "2026-03-01", reportedToAdmin: true }), 201);
    await new Promise((r) => setTimeout(r, 100));
    const reasons = publish.mock.calls.filter((c) => c[0] === "refresh").map((c) => c[1].reason);
    expect(reasons).toEqual(expect.arrayContaining(["round-started", "scan", "incident-created", "round-ended", "shift-handover-created"]));
  });

  it("si publicar falla, la operación se completa igual y el error no llega al cliente", async () => {
    publish.mockRejectedValue(new Error("Ably caído: key=secreta"));
    const res = await api().post(`${V1}/chat/messages`).set("Authorization", s.guard1.auth).send({ message: "Sin red en vivo" });
    expectOk(res, 201);
    expect(JSON.stringify(res.body)).not.toMatch(/Ably|secreta/);
    const incident = await api().post(`${V1}/incidents`).set("Authorization", s.guard1.auth).send({ title: "Con Ably caído" });
    expectOk(incident, 201);
  });
});
