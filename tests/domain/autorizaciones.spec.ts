/**
 * [A2] Personas autorizadas con horario (03 §6): decisión de acceso y API de caseta.
 */
import request from "supertest";
import { app } from "@src/app";
import { decideAccess, Authorization, Moment } from "@src/modules/authorizations/access-decision";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const base: Authorization = {
  scope: "PEDESTRIAN",
  days: "1,2,3,4,5",
  startTime: "08:00",
  endTime: "16:00",
  validFrom: new Date("2026-10-01T00:00:00Z"),
  validUntil: null,
  revokedAt: null,
};
const monday10: Moment = { date: new Date("2026-10-19T00:00:00Z"), weekday: 1, minutes: 10 * 60 };
const saturday10: Moment = { date: new Date("2026-10-24T00:00:00Z"), weekday: 6, minutes: 10 * 60 };

describe("decisión de acceso", () => {
  it("dentro de días y horas: autorizado", () => {
    expect(decideAccess(base, "PEDESTRIAN", monday10)).toEqual({ decision: "AUTHORIZED", reason: "IN_SCHEDULE" });
  });

  it("fuera de días: pide aprobación al titular, no rechaza en automático", () => {
    expect(decideAccess(base, "PEDESTRIAN", saturday10).decision).toBe("NEEDS_APPROVAL");
  });

  it("revocada, vencida o de otro alcance: denegado", () => {
    expect(decideAccess({ ...base, revokedAt: new Date() }, "PEDESTRIAN", monday10).reason).toBe("REVOKED");
    expect(decideAccess({ ...base, validUntil: new Date("2026-10-10T00:00:00Z") }, "PEDESTRIAN", monday10).reason).toBe("EXPIRED");
    expect(decideAccess({ ...base, scope: "PEDESTRIAN" }, "VEHICLE", monday10).reason).toBe("SCOPE_MISMATCH");
    expect(decideAccess({ ...base, scope: "BOTH" }, "VEHICLE", monday10).decision).toBe("AUTHORIZED");
  });
});

describe("API de autorizaciones", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await disconnectDatabase();
  });

  const makeProperty = async () => {
    const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
    const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
    const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
    return prisma.property.create({
      data: { identifier: "AUT-1", name: "Casa", mainStreet: "C", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
    });
  };

  it("la caseta ve AUTHORIZED dentro del horario; tras revocar, DENIED en la siguiente consulta", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const guard = `Bearer ${tokenFor(await buildUser("GUARD"))}`;
    const property = await makeProperty();
    const person = await prisma.person.create({ data: { firstName: "Jardinero" } });
    const everyDay = { personId: person.id, days: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59", validFrom: "2026-01-01" };

    const created = await request(app).post(`/api/v1/properties/${property.id}/authorizations`).set("Authorization", admin).send(everyDay);
    expect(created.status).toBe(201);

    const check = `/api/v1/authorizations/check?propertyId=${property.id}&personId=${person.id}`;
    expect((await request(app).get(check).set("Authorization", guard)).body.data.decision).toBe("AUTHORIZED");

    await request(app).post(`/api/v1/authorizations/${created.body.data.id}/revoke`).set("Authorization", admin);
    const after = await request(app).get(check).set("Authorization", guard);
    expect(after.body.data).toEqual({ decision: "DENIED", reason: "REVOKED" });
  });

  it("fuera de los días configurados pide aprobación", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const guard = `Bearer ${tokenFor(await buildUser("GUARD"))}`;
    const property = await makeProperty();
    const person = await prisma.person.create({ data: { firstName: "Empleada" } });
    const otherDay = (new Date().getUTCDay() + 1) % 7;
    await request(app)
      .post(`/api/v1/properties/${property.id}/authorizations`)
      .set("Authorization", admin)
      .send({ personId: person.id, days: [otherDay], startTime: "00:00", endTime: "23:59", validFrom: "2026-01-01" });
    const res = await request(app).get(`/api/v1/authorizations/check?propertyId=${property.id}&personId=${person.id}`).set("Authorization", guard);
    expect(res.body.data.decision).toBe("NEEDS_APPROVAL");
  });

  it("validación: horario invertido se rechaza; sin autorización la caseta niega; el residente no consulta", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const property = await makeProperty();
    const person = await prisma.person.create({ data: { firstName: "X" } });
    const bad = await request(app)
      .post(`/api/v1/properties/${property.id}/authorizations`)
      .set("Authorization", admin)
      .send({ personId: person.id, days: [1], startTime: "16:00", endTime: "08:00", validFrom: "2026-01-01" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("SCHEDULE_INVALID");

    const guard = `Bearer ${tokenFor(await buildUser("GUARD"))}`;
    const none = await request(app).get(`/api/v1/authorizations/check?propertyId=${property.id}&personId=${person.id}`).set("Authorization", guard);
    expect(none.body.data).toEqual({ decision: "DENIED", reason: "NO_AUTHORIZATION" });

    const resident = `Bearer ${tokenFor(await buildUser("RESDN"))}`;
    expect((await request(app).get(`/api/v1/authorizations/check?propertyId=${property.id}&personId=${person.id}`).set("Authorization", resident)).status).toBe(403);
  });
});
