/**
 * Aviso directo a usuarios concretos: solo ADMIN, llega a la bandeja y a los
 * dispositivos de cada destinatario, y rechaza usuarios inexistentes.
 */
import request from "supertest";
import { app } from "@src/app";
import { processOutbox } from "@src/core/outbox/outbox";
import { PushMessage, PushSender, setPushSender } from "@src/core/push/push-sender";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const api = "/api/v1";
const base = () => new Date(Date.now() + 1000);

class FakePushSender implements PushSender {
  sent: { token: string; message: PushMessage }[] = [];
  async send(token: string, message: PushMessage): Promise<void> {
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

describe("avisos directos", () => {
  it("ADMIN manda a usuarios concretos: bandeja y push", async () => {
    const guard = await buildUser("GUARD");
    const resident = await buildUser("RESDN");
    await prisma.pushDevice.create({ data: { userId: guard.id, token: "tok-guard-0000000000", platform: "android" } });
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

    const res = await request(app)
      .post(`${api}/notifications`)
      .set("Authorization", admin)
      .send({ userIds: [guard.id, resident.id, guard.id], title: "Corte de agua", body: "Mañana de 9 a 13 h." });
    expect(res.status).toBe(202);
    expect(res.body.data.recipients).toBe(2);

    await processOutbox(base());

    const inbox = await prisma.notification.findMany({ where: { userId: { in: [guard.id, resident.id] } } });
    expect(inbox).toHaveLength(2);
    expect(fake.sent.map((s) => s.token)).toEqual(["tok-guard-0000000000"]);
    expect(fake.sent[0].message).toMatchObject({ title: "Corte de agua" });
  });

  it("un residente no puede mandar avisos", async () => {
    const resident = await buildUser("RESDN");
    const other = await buildUser("GUARD");
    const res = await request(app)
      .post(`${api}/notifications`)
      .set("Authorization", `Bearer ${tokenFor(resident)}`)
      .send({ userIds: [other.id], title: "Hola", body: "Mensaje de prueba" });
    expect(res.status).toBe(403);
  });

  it("rechaza usuarios que no existen", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const res = await request(app)
      .post(`${api}/notifications`)
      .set("Authorization", admin)
      .send({ userIds: [999999], title: "Hola", body: "Mensaje de prueba" });
    expect(res.status).toBe(404);
  });

  it("valida título y lista de destinatarios", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const res = await request(app)
      .post(`${api}/notifications`)
      .set("Authorization", admin)
      .send({ userIds: [], title: "", body: "Mensaje de prueba" });
    expect(res.status).toBe(400);
  });
});
