/**
 * [A2] Pase permanente de una autorización: el token sale una vez, en la base solo queda su huella;
 * la caseta lo valida con la misma decisión de acceso; reemitir o revocar lo invalida.
 */
import { createHash } from "crypto";
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

const setup = async () => {
  const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
  const guard = `Bearer ${tokenFor(await buildUser("GUARD"))}`;
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: { identifier: "PASE-1", name: "Casa", mainStreet: "C", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  const person = await prisma.person.create({ data: { firstName: "Mario" } });
  const created = await request(app)
    .post(`/api/v1/properties/${property.id}/authorizations`)
    .set("Authorization", admin)
    .send({ personId: person.id, days: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59", validFrom: "2026-01-01" });
  return { admin, guard, authId: created.body.data.id as number };
};

describe("pase permanente", () => {
  it("el token se devuelve una vez y en la base solo queda su huella", async () => {
    const { admin, authId } = await setup();
    const res = await request(app).post(`/api/v1/authorizations/${authId}/pass`).set("Authorization", admin);
    expect(res.status).toBe(201);
    const token: string = res.body.data.token;
    const row = await prisma.propertyAuthorization.findUniqueOrThrow({ where: { id: authId } });
    expect(row.passHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.passHash).not.toBe(token);
  });

  it("la caseta valida el pase dentro de horario y ve el nombre de la persona", async () => {
    const { admin, guard, authId } = await setup();
    const token: string = (await request(app).post(`/api/v1/authorizations/${authId}/pass`).set("Authorization", admin)).body.data.token;
    const res = await request(app).post("/api/v1/authorizations/pass/verify").set("Authorization", guard).send({ token });
    expect(res.body.data).toMatchObject({ decision: "AUTHORIZED", person: { firstName: "Mario" } });
  });

  it("reemitir invalida el pase anterior; revocar invalida el pase actual", async () => {
    const { admin, guard, authId } = await setup();
    const first: string = (await request(app).post(`/api/v1/authorizations/${authId}/pass`).set("Authorization", admin)).body.data.token;
    const second: string = (await request(app).post(`/api/v1/authorizations/${authId}/pass`).set("Authorization", admin)).body.data.token;

    expect((await request(app).post("/api/v1/authorizations/pass/verify").set("Authorization", guard).send({ token: first })).body.data.reason).toBe("UNKNOWN_PASS");
    expect((await request(app).post("/api/v1/authorizations/pass/verify").set("Authorization", guard).send({ token: second })).body.data.decision).toBe("AUTHORIZED");

    await request(app).post(`/api/v1/authorizations/${authId}/revoke`).set("Authorization", admin);
    expect((await request(app).post("/api/v1/authorizations/pass/verify").set("Authorization", guard).send({ token: second })).body.data.reason).toBe("REVOKED");
  });

  it("no se emite pase de una autorización revocada; un token inventado se niega", async () => {
    const { admin, guard, authId } = await setup();
    await request(app).post(`/api/v1/authorizations/${authId}/revoke`).set("Authorization", admin);
    expect((await request(app).post(`/api/v1/authorizations/${authId}/pass`).set("Authorization", admin)).status).toBe(409);
    const fake = await request(app).post("/api/v1/authorizations/pass/verify").set("Authorization", guard).send({ token: "x".repeat(40) });
    expect(fake.body.data).toEqual({ decision: "DENIED", reason: "UNKNOWN_PASS", person: null });
  });

  it("permisos: emitir es de residents.manage; verificar es de access.check (el residente no verifica)", async () => {
    const { guard, authId } = await setup();
    expect((await request(app).post(`/api/v1/authorizations/${authId}/pass`).set("Authorization", guard)).status).toBe(403);
    const resident = `Bearer ${tokenFor(await buildUser("RESDN"))}`;
    expect((await request(app).post("/api/v1/authorizations/pass/verify").set("Authorization", resident).send({ token: "x".repeat(40) })).status).toBe(403);
  });
});
