/**
 * Pases de visita (/invitations): solo caseta, jefe y admin (`invitation.manage`) o la residente dueña
 * (sus permisos propios). Antes las rutas no exigían permiso y mantenimiento listaba todos los pases.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, RoleName, tokenFor } from "../factories";

const api = "/api/v1/invitations";
const HOUR = 3600_000;

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const authFor = async (role: RoleName) => {
  const user = await buildUser(role);
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const makeProperty = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const occupancy = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: occupancy.id },
  });
};

const makeResident = async (propertyId: number) => {
  const { user, auth } = await authFor("RESDN");
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
  await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, auth };
};

const makeInvitation = async (propertyId: number, createdById: number, code: string) => {
  const type = await prisma.invitationType.findFirstOrThrow({ where: { name: "VISITOR" } });
  return prisma.invitation.create({
    data: {
      code,
      guestName: `Visita ${code}`,
      createdById,
      propertyId,
      typeId: type.id,
      validFrom: new Date(Date.now() - HOUR),
      validUntil: new Date(Date.now() + 4 * HOUR),
    },
  });
};

/** Escenario: dos casas, cada una con su residente y un pase. */
const scenario = async () => {
  const houseA = await makeProperty("INV-A");
  const houseB = await makeProperty("INV-B");
  const residentA = await makeResident(houseA.id);
  const residentB = await makeResident(houseB.id);
  const passA = await makeInvitation(houseA.id, residentA.user.id, "AXZ-SECA01");
  const passB = await makeInvitation(houseB.id, residentB.user.id, "AXZ-SECB01");
  const type = await prisma.invitationType.findFirstOrThrow({ where: { name: "VISITOR" } });
  return { houseA, houseB, residentA, residentB, passA, passB, type };
};

const newPass = (propertyId: number, typeId: number) => ({
  guestName: "Visita nueva",
  propertyId,
  typeId,
  validFrom: new Date(Date.now() - HOUR).toISOString(),
  validUntil: new Date(Date.now() + 2 * HOUR).toISOString(),
});

describe("/invitations · roles sin permiso (mantenimiento)", () => {
  it("MAINT no lista, no consulta, no crea ni cambia estados (403) y el pase no cambia", async () => {
    const { houseA, passA, type } = await scenario();
    const { auth } = await authFor("MAINT");

    expect((await request(app).post(`${api}/datatable`).set("Authorization", auth).send({ page: 1, limit: 10 })).status).toBe(403);
    expect((await request(app).get(`${api}/${passA.code}`).set("Authorization", auth)).status).toBe(403);
    expect((await request(app).post(api).set("Authorization", auth).send(newPass(houseA.id, type.id))).status).toBe(403);
    expect((await request(app).put(`${api}/${passA.id}/status`).set("Authorization", auth).send({ status: "ENTERED" })).status).toBe(403);

    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: passA.id } })).status).toBe("PENDING");
    expect(await prisma.invitation.count()).toBe(2);
  });

  it("sin sesión responde 401", async () => {
    expect((await request(app).post(`${api}/datatable`).send({ page: 1, limit: 10 })).status).toBe(401);
  });
});

describe("/invitations · caseta, jefe y admin", () => {
  it.each(["GUARD", "SHIFT", "ADMIN"] as RoleName[])("%s lista todos los pases y consulta por código", async (role) => {
    const { passA, passB } = await scenario();
    const { auth } = await authFor(role);

    const list = await request(app).post(`${api}/datatable`).set("Authorization", auth).send({ page: 1, limit: 10 });
    expect(list.status).toBe(200);
    expect(list.body.data.rows.map((row: { code: string }) => row.code).sort()).toEqual([passA.code, passB.code]);
    expect((await request(app).get(`${api}/${passB.code}`).set("Authorization", auth)).status).toBe(200);
  });

  it("el guardia registra entrada y salida", async () => {
    const { passA } = await scenario();
    const { auth } = await authFor("GUARD");

    const entry = await request(app).put(`${api}/${passA.id}/status`).set("Authorization", auth).send({ status: "ENTERED" });
    expect(entry.status).toBe(200);
    const exit = await request(app).put(`${api}/${passA.id}/status`).set("Authorization", auth).send({ status: "EXITED" });
    expect(exit.status).toBe(200);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: passA.id } })).status).toBe("EXITED");
  });
});

describe("/invitations · residente dueña", () => {
  it("solo ve sus pases, aunque pida los de otra casa en el filtro", async () => {
    const { houseB, residentA, passA } = await scenario();

    const own = await request(app).post(`${api}/datatable`).set("Authorization", residentA.auth).send({ page: 1, limit: 10 });
    expect(own.status).toBe(200);
    expect(own.body.data.rows.map((row: { code: string }) => row.code)).toEqual([passA.code]);

    const sneaky = await request(app)
      .post(`${api}/datatable`)
      .set("Authorization", residentA.auth)
      .send({ page: 1, limit: 10, filters: { propertyId: houseB.id } });
    expect(sneaky.body.data.rows).toEqual([]);
  });

  it("no consulta ni revoca el pase de otra residente", async () => {
    const { residentA, passB } = await scenario();

    expect((await request(app).get(`${api}/${passB.code}`).set("Authorization", residentA.auth)).status).toBe(403);
    expect(
      (await request(app).put(`${api}/${passB.id}/status`).set("Authorization", residentA.auth).send({ status: "CANCELLED", reason: "x" })).status,
    ).toBe(403);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: passB.id } })).status).toBe("PENDING");
  });

  it("no marca su propia entrada (eso lo hace la caseta), pero sí revoca su pase", async () => {
    const { residentA, passA } = await scenario();

    expect((await request(app).put(`${api}/${passA.id}/status`).set("Authorization", residentA.auth).send({ status: "ENTERED" })).status).toBe(403);
    const revoked = await request(app).put(`${api}/${passA.id}/status`).set("Authorization", residentA.auth).send({ status: "CANCELLED", reason: "Ya no viene" });
    expect(revoked.status).toBe(200);
    expect(revoked.body.data).toMatchObject({ status: "CANCELLED", revokedReason: "Ya no viene" });
    expect(revoked.body.data.revokedAt).toBeTruthy();
  });


  it("toma el vínculo Person → Resident y no la propiedad legacy cuando difieren", async () => {
    const { houseA, houseB, residentA, type } = await scenario();
    await prisma.user.update({ where: { id: residentA.user.id }, data: { propertyId: houseB.id } });

    expect((await request(app).post(api).set("Authorization", residentA.auth).send(newPass(houseA.id, type.id))).status).toBe(201);
    expect((await request(app).post(api).set("Authorization", residentA.auth).send(newPass(houseB.id, type.id))).status).toBe(403);
  });

  it("acepta User.propertyId como respaldo solo si no hay vínculo de residente", async () => {
    const { houseA, type } = await scenario();
    const { user, auth } = await authFor("RESDN");
    await prisma.user.update({ where: { id: user.id }, data: { propertyId: houseA.id } });

    expect((await request(app).post(api).set("Authorization", auth).send(newPass(houseA.id, type.id))).status).toBe(201);
  });

  it("no crea pases para una casa que no es suya", async () => {
    const { houseA, houseB, residentA, type } = await scenario();

    expect((await request(app).post(api).set("Authorization", residentA.auth).send(newPass(houseB.id, type.id))).status).toBe(403);
    expect((await request(app).post(api).set("Authorization", residentA.auth).send(newPass(houseA.id, type.id))).status).toBe(201);
  });
});
