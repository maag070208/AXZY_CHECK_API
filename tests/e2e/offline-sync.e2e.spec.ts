/**
 * Lo que el servidor debe garantizar a la cola offline del guardia: reintentar nunca duplica,
 * lo capturado sin red no se pierde y queda marcado como offline.
 */
import { api, allSessions, bootFlows, disconnectDatabase, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

/** El estado HTTP de un reintento no importa a la cola: solo que el servidor lo acepte. */
const expectOk = (res: { status: number; body: any }) => {
  expect(res.status).toBeLessThan(300);
  expect(res.body.success).toBe(true);
  return res.body.data;
};

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

const offline = (path: string, body: object, method: "post" | "put" = "post") =>
  api()[method](`${V1}${path}`).set("Authorization", s.guard1.auth).set("X-Offline-Sync", "true").send(body);

const startRound = async (clientRef: string) =>
  expectOk(await offline("/rounds/start", { recurringConfigId: flows.routes.configurationId, clientRef, confirmed: true, startedAt: new Date().toISOString() }));

const scan = (clientRef: string, roundId?: number, extra: object = {}) =>
  offline("/kardex", {
    userId: s.guard1.id,
    locationId: flows.routes.locationIds[0],
    notes: "Sin red",
    media: [],
    clientRef,
    roundId,
    scannedAt: new Date().toISOString(),
    ...extra,
  });

describe("cola offline del guardia", () => {
  it("rondas: repetir inicio o cierre no duplica y queda marcada como offline", async () => {
    const first = await startRound("ronda-1");
    const again = expectOk(await offline("/rounds/start", { recurringConfigId: flows.routes.configurationId, clientRef: "ronda-1", confirmed: true }));
    expect(again.id).toBe(first.id);
    expect(await prisma.round.count({ where: { clientRef: "ronda-1" } })).toBe(1);
    expect(await prisma.round.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ createdOffline: true });

    const close = () => api().put(`${V1}/rounds/${first.id}/end`).set("Authorization", s.guard1.auth).set("X-Offline-Sync", "true").set("Idempotency-Key", "ronda-1").send({ endedAt: new Date().toISOString() });
    expectOk(await close());
    expectOk(await close());
  });

  it("puntos: repetir el mismo punto no duplica", async () => {
    const round = await startRound("ronda-2");
    const first = expectOk(await scan("punto-1", round.id));
    const again = expectOk(await scan("punto-1", round.id));
    expect(again.id).toBe(first.id);
    expect(await prisma.kardex.count({ where: { clientRef: "punto-1" } })).toBe(1);
    expect(await prisma.kardex.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ createdOffline: true, roundId: round.id });
  });

  it("un punto capturado sin red entra aunque la ronda ya se haya cerrado", async () => {
    const round = await startRound("ronda-3");
    expectOk(await api().put(`${V1}/rounds/${round.id}/end`).set("Authorization", s.guard1.auth).send({}));

    expectOk(await scan("punto-tarde", round.id));

    const online = await api().post(`${V1}/kardex`).set("Authorization", s.guard1.auth).send({ userId: s.guard1.id, locationId: flows.routes.locationIds[0], roundId: round.id });
    expect(online.status).toBe(409);
  });

  it.each([
    ["incidencia", "/incidents", () => prisma.incident],
    ["mantenimiento", "/maintenance", () => prisma.maintenance],
    ["casa club", "/club", () => prisma.incident],
  ])("%s: repetir el reporte no duplica y conserva la fecha de captura", async (_name, path, table) => {
    const type = await prisma.incidentType.findFirstOrThrow();
    const capturedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const body = { title: "Reporte", categoryId: type.categoryId, typeId: type.id, description: "Sin red", media: [], clientRef: `rep${path}`, createdAt: capturedAt };
    const first = expectOk(await offline(path, body));
    const again = expectOk(await offline(path, body));
    expect(again.id).toBe(first.id);
    const saved = await (table() as any).findFirstOrThrow({ where: { clientRef: `rep${path}` } });
    expect(saved).toMatchObject({ createdOffline: true });
    expect(saved.createdAt.toISOString()).toBe(capturedAt);
  });

  describe("asignaciones especiales", () => {
    const makeAssignment = () =>
      prisma.assignment.create({
        data: {
          guardId: s.guard1.id,
          locationId: flows.routes.locationIds[2],
          assignedBy: s.admin.id,
          tasks: { create: [{ description: "Revisar puerta" }] },
        },
        include: { tasks: true },
      });

    it("el check sin red se liga a la asignación y la pone en revisión", async () => {
      const assignment = await makeAssignment();
      const check = expectOk(await scan("asig-1", undefined, { locationId: assignment.locationId, assignmentId: assignment.id }));
      expect(check.assignmentId).toBe(assignment.id);
      expect((await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("CHECKING");
    });

    it("fijar una tarea completada es repetible: el reintento no la invierte", async () => {
      const assignment = await makeAssignment();
      const url = `${V1}/assignments/tasks/${assignment.tasks[0].id}/toggle`;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const task = expectOk(await api().patch(url).set("Authorization", s.guard1.auth).send({ completed: true }));
        expect(task.completed).toBe(true);
      }
      const toggled = expectOk(await api().patch(url).set("Authorization", s.guard1.auth).send({}));
      expect(toggled.completed).toBe(false);
    });

    it("no se puede completar la tarea de otro guardia", async () => {
      const assignment = await makeAssignment();
      const denied = await api().patch(`${V1}/assignments/tasks/${assignment.tasks[0].id}/toggle`).set("Authorization", s.guard2.auth).send({ completed: true });
      expect(denied.status).toBe(403);
    });
  });
});
