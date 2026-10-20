/**
 * [A2] Documentos privados y contactos de personas. S3 no se usa: la URL firmada se simula.
 */
import request from "supertest";
import { app } from "@src/app";
import { StorageService } from "@src/modules/storage/storage.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const DAY = 24 * 60 * 60 * 1000;

beforeAll(() => {
  process.env.AWS_BUCKET_NAME = "checkapp-test-bucket";
});

beforeEach(async () => {
  await resetDatabase();
  jest.restoreAllMocks();
});

afterAll(async () => {
  delete process.env.AWS_BUCKET_NAME;
  await disconnectDatabase();
});

const adminToken = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

/** Archivo confirmado en S3 (simulado): privado o público según `isPrivate`. */
const confirmedMedia = async (isPrivate: boolean) => {
  const admin = await buildUser("ADMIN");
  return prisma.mediaFile.create({
    data: { key: `media/${Math.random()}.pdf`, contentType: "application/pdf", sizeBytes: 100, status: "CONFIRMED", isPrivate, uploadedById: admin.id },
  });
};

const adultPerson = () => prisma.person.create({ data: { firstName: "Ana", birthDate: new Date("1990-01-01") } });

const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

describe("documentos privados", () => {
  it("T-A2-T6: un documento que vence en 10 días aparece en la alerta; el archivo es privado", async () => {
    const token = await adminToken();
    const person = await adultPerson();
    const media = await confirmedMedia(true);
    const res = await request(app)
      .post(`/api/v1/persons/${person.id}/documents`)
      .set("Authorization", token)
      .send({ kindCode: "INE", mediaFileId: media.id, expiresAt: dateIn(10) });
    expect(res.status).toBe(201);

    const alert = await request(app).get("/api/v1/persons/documents/expiring?days=30").set("Authorization", token);
    expect(alert.body.data.map((d: any) => d.id)).toContain(res.body.data.id);
    expect((await prisma.mediaFile.findUniqueOrThrow({ where: { id: media.id } })).isPrivate).toBe(true);
  });

  it("un documento cuyo archivo es público se rechaza", async () => {
    const res = await request(app)
      .post(`/api/v1/persons/${(await adultPerson()).id}/documents`)
      .set("Authorization", await adminToken())
      .send({ kindCode: "CONTRACT", mediaFileId: (await confirmedMedia(false)).id, expiresAt: dateIn(90) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DOCUMENT_FILE_NOT_PRIVATE");
  });

  it("un tipo que vence exige fecha de vencimiento", async () => {
    const res = await request(app)
      .post(`/api/v1/persons/${(await adultPerson()).id}/documents`)
      .set("Authorization", await adminToken())
      .send({ kindCode: "INE", mediaFileId: (await confirmedMedia(true)).id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DOCUMENT_EXPIRY_REQUIRED");
  });

  it("T-A2-T9: el guardia no lista documentos ni pide su URL; el administrador sí obtiene una URL firmada", async () => {
    const person = await adultPerson();
    const media = await confirmedMedia(true);
    const admin = await adminToken();
    const doc = await request(app).post(`/api/v1/persons/${person.id}/documents`).set("Authorization", admin).send({ kindCode: "INE", mediaFileId: media.id, expiresAt: dateIn(200) });

    const guardToken = `Bearer ${tokenFor(await buildUser("GUARD"))}`;
    expect((await request(app).get(`/api/v1/persons/${person.id}/documents`).set("Authorization", guardToken)).status).toBe(403);
    expect((await request(app).get(`/api/v1/persons/${person.id}/documents/${doc.body.data.id}/url`).set("Authorization", guardToken)).status).toBe(403);

    jest.spyOn(StorageService.prototype, "getSignedReadUrl").mockResolvedValue("https://firmada.example/x?X-Amz-Expires=900");
    const url = await request(app).get(`/api/v1/persons/${person.id}/documents/${doc.body.data.id}/url`).set("Authorization", admin);
    expect(url.status).toBe(200);
    expect(url.body.data.url).toContain("X-Amz-Expires=900");
    expect(url.body.data.expiresInSeconds).toBe(900);
  });

  it("T-A2-08: una persona menor no tiene documentos", async () => {
    const minor = await prisma.person.create({ data: { firstName: "Niño", birthDate: new Date(Date.now() - 10 * 365 * DAY) } });
    const res = await request(app)
      .post(`/api/v1/persons/${minor.id}/documents`)
      .set("Authorization", await adminToken())
      .send({ kindCode: "OTHER", mediaFileId: (await confirmedMedia(true)).id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PERSON_MINOR_NO_DOCUMENTS");
  });
});

describe("contactos de la persona", () => {
  it("se crean y listan; un correo inválido se rechaza", async () => {
    const token = await adminToken();
    const person = await adultPerson();
    const ok = await request(app).post(`/api/v1/persons/${person.id}/contacts`).set("Authorization", token).send({ name: "Madre", phone: "6640000001", relationship: "Madre" });
    expect(ok.status).toBe(201);
    const list = await request(app).get(`/api/v1/persons/${person.id}/contacts`).set("Authorization", token);
    expect(list.body.data.map((c: any) => c.name)).toEqual(["Madre"]);

    const bad = await request(app).post(`/api/v1/persons/${person.id}/contacts`).set("Authorization", token).send({ name: "X", email: "nope" });
    expect(bad.status).toBe(400);
    expect(bad.body.issues[0].path).toBe("body.email");
  });
});
