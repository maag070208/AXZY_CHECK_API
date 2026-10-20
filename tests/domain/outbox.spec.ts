/**
 * [T-F0-10] Outbox: entrega una vez, reintenta con espera creciente, pasa a
 * dead-letter tras 3 fallos, no duplica notificaciones al reintentar y dos
 * procesos concurrentes no toman el mismo evento.
 */
import { enqueueOutbox, OutboxHandler, processOutbox, backoffMs } from "@src/core/outbox/outbox";
import { notifyUsersHandler } from "@src/core/outbox/handlers";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const DAY = 24 * 60 * 60 * 1000;
/** Instante de referencia: justo después de encolar, para que el evento ya esté vencido. */
const base = () => new Date(Date.now() + 1000);
const at = (origin: Date, ms: number) => new Date(origin.getTime() + ms);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("entrega", () => {
  it("un evento que funciona se marca SENT una sola vez y crea una notificación por usuario", async () => {
    const a = await buildUser("GUARD");
    const b = await buildUser("GUARD");
    const event = await enqueueOutbox("notification.send", { userIds: [a.id, b.id], title: "Aviso", body: "Turno iniciado" });

    expect(await processOutbox(base())).toBe(1);
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: "SENT", attempts: 1, lastError: null });
    expect(row.sentAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { outboxEventId: event.id } })).toBe(2);

    // Ya entregado: una segunda pasada no lo toca.
    expect(await processOutbox(at(base(), DAY))).toBe(0);
    expect(await prisma.notification.count({ where: { outboxEventId: event.id } })).toBe(2);
  });
});

describe("reintentos y dead-letter", () => {
  const failing: Record<string, OutboxHandler> = {
    "test.fail": async () => {
      throw new Error("fallo simulado");
    },
  };

  it("espera antes de reintentar y pasa a DEAD tras 3 fallos", async () => {
    const event = await enqueueOutbox("test.fail", {});
    const t0 = base();

    await processOutbox(t0, failing);
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastError: "fallo simulado" });
    expect(row.nextAttemptAt.getTime()).toBe(at(t0, backoffMs(1)).getTime());

    // Todavía no vence: no se reclama.
    expect(await processOutbox(at(t0, backoffMs(1) - 1), failing)).toBe(0);

    await processOutbox(at(t0, backoffMs(1)), failing);
    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 2 });

    await processOutbox(at(t0, backoffMs(1) + backoffMs(2)), failing);
    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: "DEAD", attempts: 3, lastError: "fallo simulado" });

    // DEAD no vuelve a procesarse.
    expect(await processOutbox(at(t0, DAY), failing)).toBe(0);
  });

  it("un evento sin handler registrado también agota los intentos", async () => {
    const event = await enqueueOutbox("tipo.desconocido", {});
    const t0 = base();
    for (let i = 0; i < 3; i++) {
      await processOutbox(at(t0, i * DAY), {});
    }
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("DEAD");
  });

  it("reintentar no duplica notificaciones aunque el handler falle después de escribirlas", async () => {
    const user = await buildUser("GUARD");
    const event = await enqueueOutbox("notification.send", { userIds: [user.id], title: "Aviso", body: "Hola" });
    const t0 = base();

    let calls = 0;
    const flaky: Record<string, OutboxHandler> = {
      "notification.send": async (e, payload) => {
        await notifyUsersHandler(e, payload);
        calls++;
        if (calls === 1) throw new Error("falla después de escribir");
      },
    };

    await processOutbox(t0, flaky);
    await processOutbox(at(t0, backoffMs(1)), flaky);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("SENT");
    expect(await prisma.notification.count({ where: { outboxEventId: event.id } })).toBe(1);
  });
});

describe("concurrencia", () => {
  it("dos procesos concurrentes no toman el mismo evento", async () => {
    const events = await Promise.all(Array.from({ length: 5 }, () => enqueueOutbox("test.slow", {})));
    const t0 = base();

    const calls = new Map<number, number>();
    const slow: Record<string, OutboxHandler> = {
      "test.slow": async (event) => {
        calls.set(event.id, (calls.get(event.id) ?? 0) + 1);
        await sleep(50);
      },
    };

    const [first, second] = await Promise.all([processOutbox(t0, slow), processOutbox(t0, slow)]);

    expect(first + second).toBe(events.length);
    for (const event of events) {
      expect(calls.get(event.id)).toBe(1);
    }
  });
});
