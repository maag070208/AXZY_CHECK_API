/**
 * Buzón de quejas (módulo 13, fases 0 y 1): alta por residente con propiedad activa,
 * aislamiento entre residentes, notas internas ocultas, transiciones de estado y límites de fotos.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const base = "/api/v1/complaints";
const MB = 1024 * 1024;

const makeProperty = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  await prisma.occupancyPeriod.create({ data: { propertyId: property.id, statusId: vacant.id, startDate: new Date() } });
  return property;
};

/** Residente con Person ligada a su usuario y Resident ACTIVE en la propiedad dada. */
const makeResident = async (propertyId: number | null) => {
  const user = await buildUser("RESDN");
  if (propertyId !== null) {
    const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
    const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
    await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  }
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const staffAuth = async (role: "ADMIN" | "SHIFT" = "ADMIN") => `Bearer ${tokenFor(await buildUser(role))}`;

const validBody = { category: "RUIDO", title: "Ruido nocturno", description: "Música fuerte después de medianoche" };

const photo = (size = 1 * MB) => ({ type: "IMAGE", url: "https://files.example.test/a.jpg", key: "complaints/a.jpg", size });

const createAs = async (auth: string, body: object = validBody) => request(app).post(base).set("Authorization", auth).send(body);

describe("alta de queja", () => {
  it("el residente crea la queja en SU propiedad, con estado NEW y su evento inicial", async () => {
    const property = await makeProperty("Q-1");
    const { auth } = await makeResident(property.id);
    const res = await createAs(auth, { ...validBody, media: [photo()] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ propertyId: property.id, status: "NEW", category: "RUIDO" });
    const events = await prisma.complaintEvent.findMany({ where: { complaintId: res.body.data.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: null, toStatus: "NEW" });
  });

  it("un residente sin propiedad activa no puede levantar quejas (403 NO_ACTIVE_RESIDENCE)", async () => {
    const { auth } = await makeResident(null);
    const res = await createAs(auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("NO_ACTIVE_RESIDENCE");
  });

  it("el personal de administración no crea quejas (solo el residente)", async () => {
    const res = await createAs(await staffAuth("ADMIN"));
    expect(res.status).toBe(403);
  });

  it("más de 3 fotos se rechaza con 400", async () => {
    const property = await makeProperty("Q-2");
    const { auth } = await makeResident(property.id);
    const res = await createAs(auth, { ...validBody, media: [photo(), photo(), photo(), photo()] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("acepta un video de evidencia (hasta 30 MB) y rechaza un segundo video", async () => {
    const property = await makeProperty("Q-V");
    const { auth } = await makeResident(property.id);
    const video = { type: "VIDEO", url: "https://files.example.test/v.mp4", key: "complaints/v.mp4", size: 20 * MB };
    const ok = await createAs(auth, { ...validBody, media: [video] });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toBeTruthy();
    const two = await createAs(auth, { ...validBody, media: [video, { ...video, key: "complaints/v2.mp4" }] });
    expect(two.status).toBe(400);
  });

  it("rechaza un video de más de 30 MB", async () => {
    const property = await makeProperty("Q-V2");
    const { auth } = await makeResident(property.id);
    const res = await createAs(auth, { ...validBody, media: [{ type: "VIDEO", url: "https://files.example.test/v.mp4", key: "complaints/v.mp4", size: 31 * MB }] });
    expect(res.status).toBe(400);
  });

  it("una foto mayor a 5 MB se rechaza con 400", async () => {
    const property = await makeProperty("Q-3");
    const { auth } = await makeResident(property.id);
    const res = await createAs(auth, { ...validBody, media: [photo(6 * MB)] });
    expect(res.status).toBe(400);
  });

  it("título vacío y campos extra se rechazan (schema estricto)", async () => {
    const property = await makeProperty("Q-4");
    const { auth } = await makeResident(property.id);
    expect((await createAs(auth, { ...validBody, title: "   " })).status).toBe(400);
    expect((await createAs(auth, { ...validBody, authorId: 999 })).status).toBe(400);
  });
});

describe("aislamiento entre residentes (fase 0)", () => {
  it("un residente de la propiedad A no ve ni escribe en la queja de la propiedad B (404)", async () => {
    const a = await makeResident((await makeProperty("Q-A")).id);
    const b = await makeResident((await makeProperty("Q-B")).id);
    const created = await createAs(a.auth);
    const id = created.body.data.id;

    expect((await request(app).get(`${base}/${id}`).set("Authorization", b.auth)).status).toBe(404);
    expect((await request(app).post(`${base}/${id}/messages`).set("Authorization", b.auth).send({ body: "hola" })).status).toBe(404);
    expect((await request(app).patch(`${base}/${id}/status`).set("Authorization", b.auth).send({ status: "CLOSED" })).status).toBe(404);
  });

  it("el listado del residente solo trae sus propias quejas", async () => {
    const a = await makeResident((await makeProperty("Q-LA")).id);
    const b = await makeResident((await makeProperty("Q-LB")).id);
    await createAs(a.auth);
    await createAs(b.auth);
    const res = await request(app).get(base).set("Authorization", a.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items.every((c: { authorId: number }) => c.authorId === a.user.id)).toBe(true);
  });
});

describe("notas internas", () => {
  it("el residente no ve mensajes internos; el personal sí", async () => {
    const property = await makeProperty("Q-N");
    const resident = await makeResident(property.id);
    const staff = await staffAuth();
    const id = (await createAs(resident.auth)).body.data.id;

    await request(app).post(`${base}/${id}/messages`).set("Authorization", staff).send({ body: "Público", internal: false });
    await request(app).post(`${base}/${id}/messages`).set("Authorization", staff).send({ body: "Nota interna", internal: true });

    const asResident = await request(app).get(`${base}/${id}`).set("Authorization", resident.auth);
    expect(asResident.body.data.messages.map((m: { body: string }) => m.body)).toEqual(["Público"]);

    const asStaff = await request(app).get(`${base}/${id}`).set("Authorization", staff);
    expect(asStaff.body.data.messages).toHaveLength(2);
  });

  it("el residente no puede enviar una nota interna (403)", async () => {
    const property = await makeProperty("Q-NI");
    const resident = await makeResident(property.id);
    const id = (await createAs(resident.auth)).body.data.id;
    const res = await request(app).post(`${base}/${id}/messages`).set("Authorization", resident.auth).send({ body: "Nota de prueba", internal: true });
    expect(res.status).toBe(403);
  });
});

describe("transiciones de estado", () => {
  it("el personal avanza NEW → IN_REVIEW; un salto no permitido responde 409 INVALID_TRANSITION", async () => {
    const property = await makeProperty("Q-T");
    const resident = await makeResident(property.id);
    const staff = await staffAuth();
    const id = (await createAs(resident.auth)).body.data.id;

    const skip = await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "RESOLVED" });
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe("INVALID_TRANSITION");

    const ok = await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "IN_REVIEW" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("IN_REVIEW");
  });

  it("el residente no puede cambiar el estado salvo dar por buena una queja RESOLVED (RESOLVED → CLOSED)", async () => {
    const property = await makeProperty("Q-R");
    const resident = await makeResident(property.id);
    const staff = await staffAuth();
    const id = (await createAs(resident.auth)).body.data.id;

    const denied = await request(app).patch(`${base}/${id}/status`).set("Authorization", resident.auth).send({ status: "IN_REVIEW" });
    expect(denied.status).toBe(403);

    await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "IN_REVIEW" });
    await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "RESOLVED" });
    const closed = await request(app).patch(`${base}/${id}/status`).set("Authorization", resident.auth).send({ status: "CLOSED" });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe("CLOSED");
  });

  it("si la queja espera al residente, su respuesta la devuelve a revisión y deja evento", async () => {
    const property = await makeProperty("Q-W");
    const resident = await makeResident(property.id);
    const staff = await staffAuth();
    const id = (await createAs(resident.auth)).body.data.id;
    await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "IN_REVIEW" });
    await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "WAITING_RESIDENT" });

    const reply = await request(app).post(`${base}/${id}/messages`).set("Authorization", resident.auth).send({ body: "Aquí está la info" });
    expect(reply.status).toBe(201);

    const row = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("IN_REVIEW");
    const last = await prisma.complaintEvent.findFirstOrThrow({ where: { complaintId: id }, orderBy: { id: "desc" } });
    expect(last).toMatchObject({ fromStatus: "WAITING_RESIDENT", toStatus: "IN_REVIEW" });
  });

  it("una queja resuelta no admite mensajes del residente (409 COMPLAINT_CLOSED)", async () => {
    const property = await makeProperty("Q-C");
    const resident = await makeResident(property.id);
    const staff = await staffAuth();
    const id = (await createAs(resident.auth)).body.data.id;
    await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "IN_REVIEW" });
    await request(app).patch(`${base}/${id}/status`).set("Authorization", staff).send({ status: "RESOLVED" });

    const res = await request(app).post(`${base}/${id}/messages`).set("Authorization", resident.auth).send({ body: "¿Y ahora?" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COMPLAINT_CLOSED");
  });
});
