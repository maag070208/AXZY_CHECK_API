/**
 * [T-F0-T7] Validación Zod en endpoints: cuerpo inválido → 400 con lista de campos;
 * cuerpo válido pasa. Y la identidad (quién invita, quién inicia la ronda) sale del
 * token, nunca del cuerpo.
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

const adminAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

describe("respuesta de validación", () => {
  it("cuerpo inválido responde 400 con código, lista de campos y su ruta", async () => {
    const res = await request(app).post("/api/v1/club").set("Authorization", await adminAuth()).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.issues).toEqual([expect.objectContaining({ path: "body.title" })]);
  });

  it("un horario con hora fuera de rango se rechaza", async () => {
    const res = await request(app)
      .post("/api/v1/schedules")
      .set("Authorization", await adminAuth())
      .send({ name: "Mañana", startTime: "25:00", endTime: "19:00" });
    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([expect.objectContaining({ path: "body.startTime" })]);
  });

  it("un horario válido se crea", async () => {
    const res = await request(app)
      .post("/api/v1/schedules")
      .set("Authorization", await adminAuth())
      .send({ name: "Mañana", startTime: "7:00", endTime: "15:00" });
    expect(res.status).toBe(201);
  });

  it("un estado de asignación desconocido se rechaza antes de llegar al servicio", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const location = await prisma.location.create({ data: { aisle: "A", spot: "1", number: "1", name: "Ubicación validación" } });
    const assignment = await prisma.assignment.create({ data: { guardId: guard.id, locationId: location.id, assignedBy: admin.id } });

    const res = await request(app)
      .patch(`/api/v1/assignments/${assignment.id}/status`)
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ status: "INVENTADO" });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("body.status");
  });

  it("chat: un mensaje vacío conserva su mensaje de siempre", async () => {
    const guard = await buildUser("GUARD");
    const res = await request(app)
      .post("/api/v1/chat/messages")
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ message: "   " });
    expect(res.status).toBe(400);
    expect(res.body.messages).toEqual(["El mensaje no puede estar vacío"]);
  });
});

describe("invitaciones", () => {
  const setup = async () => {
    const creator = await buildUser("ADMIN");
    const otherUser = await buildUser("GUARD");
    const property = await prisma.property.create({
      data: {
        identifier: "P-VAL-1",
        name: "Casa validación",
        mainStreet: "Calle 1",
        typeId: (await prisma.propertyType.findFirstOrThrow()).id,
        statusId: (await prisma.propertyStatus.findFirstOrThrow()).id,
      },
    });
    const type = await prisma.invitationType.findFirstOrThrow();
    return { creator, otherUser, property, type };
  };

  it("valida que la fecha final sea posterior a la inicial", async () => {
    const { creator, property, type } = await setup();
    const res = await request(app)
      .post("/api/v1/invitations")
      .set("Authorization", `Bearer ${tokenFor(creator)}`)
      .send({
        guestName: "Visita",
        propertyId: property.id,
        typeId: type.id,
        validFrom: "2026-10-21T10:00:00Z",
        validUntil: "2026-10-20T10:00:00Z",
      });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("body.validUntil");
  });

  it("quien invita es el usuario del token, aunque el cuerpo diga otra cosa", async () => {
    const { creator, otherUser, property, type } = await setup();
    const res = await request(app)
      .post("/api/v1/invitations")
      .set("Authorization", `Bearer ${tokenFor(creator)}`)
      .send({
        guestName: "Visita",
        propertyId: property.id,
        typeId: type.id,
        validFrom: "2026-10-20T10:00:00Z",
        validUntil: "2026-10-21T10:00:00Z",
        createdById: otherUser.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.createdById).toBe(creator.id);
  });
});

describe("rondas", () => {
  it("la ronda se inicia a nombre del usuario del token, no del guardId del cuerpo", async () => {
    const guard = await buildUser("GUARD");
    const otherGuard = await buildUser("GUARD");
    const res = await request(app)
      .post("/api/v1/rounds/start")
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ guardId: otherGuard.id });
    expect(res.status).toBe(200);
    const round = await prisma.round.findFirstOrThrow({ where: { status: "IN_PROGRESS" } });
    expect(round.guardId).toBe(guard.id);
  });
});
