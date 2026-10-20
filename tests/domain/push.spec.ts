/**
 * [T-F0-11] Push: se envía solo a los dispositivos de los destinatarios, un token
 * inválido se elimina sin fallar el evento, y sin remitente la notificación
 * queda en la app.
 */
import { enqueueOutbox, processOutbox } from "@src/core/outbox/outbox";
import { PushMessage, PushSender, PushTokenInvalidError, setPushSender } from "@src/core/push/push-sender";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

const base = () => new Date(Date.now() + 1000);

class FakePushSender implements PushSender {
  sent: { token: string; message: PushMessage }[] = [];
  invalidTokens = new Set<string>();

  async send(token: string, message: PushMessage): Promise<void> {
    if (this.invalidTokens.has(token)) throw new PushTokenInvalidError("token inválido");
    this.sent.push({ token, message });
  }
}

let fake: FakePushSender;

beforeEach(async () => {
  await resetDatabase();
  fake = new FakePushSender();
  setPushSender(fake);
});

afterEach(() => {
  setPushSender(null);
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("envío", () => {
  it("envía solo a los dispositivos de los destinatarios", async () => {
    const a = await buildUser("GUARD");
    const b = await buildUser("GUARD");
    const outsider = await buildUser("GUARD");
    await prisma.pushDevice.createMany({
      data: [
        { userId: a.id, token: "tok-a", platform: "android" },
        { userId: b.id, token: "tok-b", platform: "ios" },
        { userId: outsider.id, token: "tok-x", platform: "android" },
      ],
    });

    await enqueueOutbox("notification.send", { userIds: [a.id, b.id], title: "Ronda", body: "Inicia tu ronda" });
    await processOutbox(base());

    expect(fake.sent.map((s) => s.token).sort()).toEqual(["tok-a", "tok-b"]);
    expect(fake.sent[0].message).toMatchObject({ title: "Ronda", body: "Inicia tu ronda" });
  });

  it("un token que el proveedor marca inválido se elimina y el evento queda SENT", async () => {
    const a = await buildUser("GUARD");
    await prisma.pushDevice.create({ data: { userId: a.id, token: "tok-viejo", platform: "android" } });
    fake.invalidTokens.add("tok-viejo");

    const event = await enqueueOutbox("notification.send", { userIds: [a.id], title: "Aviso", body: "Hola" });
    await processOutbox(base());

    expect(await prisma.pushDevice.count({ where: { token: "tok-viejo" } })).toBe(0);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("SENT");
    expect(await prisma.notification.count({ where: { userId: a.id } })).toBe(1);
  });

  it("sin remitente configurado el evento se entrega solo en la app", async () => {
    setPushSender(null);
    const a = await buildUser("GUARD");
    await prisma.pushDevice.create({ data: { userId: a.id, token: "tok-a", platform: "android" } });

    const event = await enqueueOutbox("notification.send", { userIds: [a.id], title: "Aviso", body: "Hola" });
    await processOutbox(base());

    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("SENT");
    expect(await prisma.notification.count({ where: { userId: a.id } })).toBe(1);
    expect(fake.sent).toHaveLength(0);
  });
});
