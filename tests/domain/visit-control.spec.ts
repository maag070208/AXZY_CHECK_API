/**
 * Plan 1 · control de visitas: visitas sin cita con autorización del residente, avisos al entrar y salir,
 * placa esperada, vencimiento de visitas por autorizar, repartidores sin autorización e indicadores.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, inDefaultClient, RoleName, tokenFor } from "../factories";
import ExcelJS from "exceljs";
import { expirePendingInvitations } from "@src/modules/invitations/invitations.service";

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
    data: { ...(await inDefaultClient()),  identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: occupancy.id },
  });
};

/** Residente activo de una casa: cuenta RESDN + Person + Resident ACTIVE. */
const makeResident = async (propertyId: number) => {
  const { user, auth } = await authFor("RESDN");
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { ...(await inDefaultClient()), firstName: user.name, userId: user.id } });
  await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, auth };
};

const typeId = async (name: string) => (await prisma.invitationType.findUniqueOrThrow({ where: { name } })).id;

const walkIn = (propertyId: number, type: number, extra: Record<string, unknown> = {}) => ({
  guestName: "Visita sin cita",
  propertyId,
  typeId: type,
  validFrom: new Date().toISOString(),
  validUntil: new Date(Date.now() + HOUR).toISOString(),
  walkIn: true,
  ...extra,
});

const downloadBinary = (url: string, query: Record<string, string>, auth: string) =>
  request(app).get(url).query(query).set("Authorization", auth).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => done(null, Buffer.concat(chunks)));
  });

/** Notificaciones encoladas de un tipo, con los userIds a los que van. */
const notificationsOf = async (type: string) => {
  const events = await prisma.outboxEvent.findMany({ where: { type: "notification.send" } });
  return events.map((e) => e.payload as { userIds: number[]; data: { type: string } }).filter((p) => p.data?.type === type);
};

describe("visitas sin cita (caseta)", () => {
  it("el guardia registra una visita sin cita: queda por autorizar y avisa a la casa", async () => {
    const house = await makeProperty("VC-1");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");

    const res = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "PENDING_APPROVAL", walkIn: true });
    const validUntil = new Date(res.body.data.validUntil).getTime();
    expect(Math.abs(validUntil - (Date.now() + 4 * HOUR))).toBeLessThan(60_000);

    const avisos = await notificationsOf("INVITATION_APPROVAL");
    expect(avisos).toHaveLength(1);
    expect(avisos[0].userIds).toEqual([resident.user.id]);
  });

  it("el residente de la casa autoriza: pasa a PENDING y queda registrado quién lo hizo", async () => {
    const house = await makeProperty("VC-2");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));

    const res = await request(app).put(`${api}/${created.body.data.id}/approval`).set("Authorization", resident.auth).send({ decision: "APPROVE" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "PENDING", approvedById: resident.user.id });
  });

  it("el residente de otra casa no puede autorizar (403) y la visita sigue por autorizar", async () => {
    const house = await makeProperty("VC-3");
    const other = await makeProperty("VC-4");
    await makeResident(house.id);
    const outsider = await makeResident(other.id);
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));

    const res = await request(app).put(`${api}/${created.body.data.id}/approval`).set("Authorization", outsider.auth).send({ decision: "APPROVE" });
    expect(res.status).toBe(403);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: created.body.data.id } })).status).toBe("PENDING_APPROVAL");
  });

  it("el guardia no puede autorizar su propia visita (403)", async () => {
    const house = await makeProperty("VC-5");
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));

    const res = await request(app).put(`${api}/${created.body.data.id}/approval`).set("Authorization", guard.auth).send({ decision: "APPROVE" });
    expect(res.status).toBe(403);
  });

  it("el jefe puede escalar y autorizar cualquier visita por autorizar", async () => {
    const house = await makeProperty("VC-6");
    await makeResident(house.id);
    const guard = await authFor("GUARD");
    const shift = await authFor("SHIFT");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));

    const res = await request(app).put(`${api}/${created.body.data.id}/approval`).set("Authorization", shift.auth).send({ decision: "APPROVE" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PENDING");
  });

  it("rechazar exige motivo y deja la visita cancelada con él", async () => {
    const house = await makeProperty("VC-7");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));

    expect((await request(app).put(`${api}/${created.body.data.id}/approval`).set("Authorization", resident.auth).send({ decision: "REJECT" })).status).toBe(400);
    const res = await request(app)
      .put(`${api}/${created.body.data.id}/approval`)
      .set("Authorization", resident.auth)
      .send({ decision: "REJECT", reason: "No espero a nadie" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "CANCELLED", revokedReason: "No espero a nadie" });
  });

  it("no se puede registrar la entrada antes de la autorización (409) ni decidir dos veces", async () => {
    const house = await makeProperty("VC-8");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));
    const id = created.body.data.id;

    expect((await request(app).put(`${api}/${id}/status`).set("Authorization", guard.auth).send({ status: "ENTERED" })).status).toBe(409);
    expect((await request(app).put(`${api}/${id}/approval`).set("Authorization", resident.auth).send({ decision: "APPROVE" })).status).toBe(200);
    expect((await request(app).put(`${api}/${id}/approval`).set("Authorization", resident.auth).send({ decision: "REJECT", reason: "tarde" })).status).toBe(409);
  });

  it("la entrada y la salida avisan a los residentes de la casa", async () => {
    const house = await makeProperty("VC-9");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));
    const id = created.body.data.id;
    await request(app).put(`${api}/${id}/approval`).set("Authorization", resident.auth).send({ decision: "APPROVE" });

    expect((await request(app).put(`${api}/${id}/status`).set("Authorization", guard.auth).send({ status: "ENTERED" })).status).toBe(200);
    expect((await request(app).put(`${api}/${id}/status`).set("Authorization", guard.auth).send({ status: "EXITED" })).status).toBe(200);

    const entradas = await notificationsOf("INVITATION_ENTERED");
    const salidas = await notificationsOf("INVITATION_EXITED");
    expect(entradas).toHaveLength(1);
    expect(entradas[0].userIds).toEqual([resident.user.id]);
    expect(salidas).toHaveLength(1);
  });

  it("el repartidor (tipo sin autorización) entra directo, sin aviso de autorización", async () => {
    const house = await makeProperty("VC-10");
    await makeResident(house.id);
    const guard = await authFor("GUARD");

    const res = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("DELIVERY")));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
    expect(await notificationsOf("INVITATION_APPROVAL")).toHaveLength(0);
  });

  it("el residente no puede marcar una visita como sin cita: se crea normal", async () => {
    const house = await makeProperty("VC-11");
    const resident = await makeResident(house.id);

    const res = await request(app).post(api).set("Authorization", resident.auth).send(walkIn(house.id, await typeId("VISITOR")));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "PENDING", walkIn: false });
  });

  it("el vencimiento también cierra las visitas que nunca se autorizaron", async () => {
    const house = await makeProperty("VC-12");
    await makeResident(house.id);
    const guard = await authFor("GUARD");
    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));
    await prisma.invitation.update({ where: { id: created.body.data.id }, data: { validUntil: new Date(Date.now() - HOUR) } });

    expect(await expirePendingInvitations()).toBe(1);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: created.body.data.id } })).status).toBe("EXPIRED");
  });

  it("la lista de por autorizar: el residente solo ve la de su casa; el guardia no entra (403)", async () => {
    const house = await makeProperty("VC-13");
    const other = await makeProperty("VC-14");
    const resident = await makeResident(house.id);
    const otherResident = await makeResident(other.id);
    const guard = await authFor("GUARD");
    await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));

    const mine = await request(app).get(`${api}/pending-approvals`).set("Authorization", resident.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    const theirs = await request(app).get(`${api}/pending-approvals`).set("Authorization", otherResident.auth);
    expect(theirs.body.data).toHaveLength(0);
    expect((await request(app).get(`${api}/pending-approvals`).set("Authorization", guard.auth)).status).toBe(403);
  });
});

describe("placa esperada", () => {
  it("guarda la placa normalizada y la encuentra al buscar con otro formato", async () => {
    const house = await makeProperty("PL-1");
    const resident = await makeResident(house.id);
    const created = await request(app)
      .post(api)
      .set("Authorization", resident.auth)
      .send({
        guestName: "Visita con auto",
        propertyId: house.id,
        typeId: await typeId("VISITOR"),
        validFrom: new Date(Date.now() - HOUR).toISOString(),
        validUntil: new Date(Date.now() + 5 * HOUR).toISOString(),
        expectedPlate: "abc-123 ",
      });
    expect(created.status).toBe(201);
    expect(created.body.data.expectedPlate).toBe("ABC123");

    const admin = await authFor("ADMIN");
    const found = await request(app).post(`${api}/datatable`).set("Authorization", admin.auth).send({ page: 1, limit: 10, filters: { search: "abc 123" } });
    expect(found.body.data.rows.map((r: { id: number }) => r.id)).toEqual([created.body.data.id]);
  });
});

describe("indicadores y estado de caseta", () => {
  it("el admin ve indicadores; la caseta ve la permanencia máxima y quién la rebasa", async () => {
    const house = await makeProperty("ST-1");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");
    const type = await typeId("VISITOR");
    const created = await request(app).post(api).set("Authorization", resident.auth).send({
      guestName: "Visita larga",
      propertyId: house.id,
      typeId: type,
      validFrom: new Date(Date.now() - 20 * HOUR).toISOString(),
      validUntil: new Date(Date.now() + HOUR).toISOString(),
    });
    // Entró hace 13 horas (más que las 12 de permanencia por defecto) y aún está dentro.
    await prisma.invitation.update({
      where: { id: created.body.data.id },
      data: { status: "ENTERED", entryTime: new Date(Date.now() - 13 * HOUR) },
    });

    const status = await request(app).get(`${api}/caseta-status`).set("Authorization", guard.auth);
    expect(status.status).toBe(200);
    expect(status.body.data).toEqual({ maxStayHours: 12, overstayedIds: [created.body.data.id] });

    const admin = await authFor("ADMIN");
    const from = new Date(Date.now() - 2 * 24 * HOUR).toISOString();
    const to = new Date(Date.now() + HOUR).toISOString();
    const stats = await request(app).get(`${api}/stats`).query({ from, to }).set("Authorization", admin.auth);
    expect(stats.status).toBe(200);
    expect(stats.body.data).toMatchObject({ maxStayHours: 12, entries: 1, overstayedNow: 1 });
    expect(stats.body.data.byHour).toHaveLength(24);
    expect(stats.body.data.byProperty[0]).toMatchObject({ identifier: "ST-1", entries: 1 });

    expect((await request(app).get(`${api}/stats`).query({ from, to }).set("Authorization", guard.auth)).status).toBe(403);
  });
});

describe("intentos rechazados en caseta", () => {
  const passOf = async (status: "PENDING" | "EXPIRED" | "CANCELLED" | "EXITED", code: string, propertyId: number, window = { from: -HOUR, until: HOUR }) => {
    const owner = await authFor("RESDN");
    return prisma.invitation.create({
      data: {
        code,
        guestName: "Visita",
        createdById: owner.user.id,
        propertyId,
        typeId: await typeId("VISITOR"),
        status,
        validFrom: new Date(Date.now() + window.from),
        validUntil: new Date(Date.now() + window.until),
      },
    });
  };
  const denied = (invitationId: number) => prisma.accessEvent.findMany({ where: { invitationId, decision: "DENIED" } });

  it.each([
    ["EXPIRED", "EXPIRED"],
    ["CANCELLED", "REVOKED"],
    ["EXITED", "ALREADY_USED"],
  ] as const)("leer un pase %s deja el rechazo %s en la bitácora", async (status, reason) => {
    const house = await makeProperty(`RJ-${status}`);
    const guard = await authFor("GUARD");
    const pass = await passOf(status, `AXZ-${status}`, house.id);

    const res = await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: pass.code });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: pass.id, status });
    expect(await denied(pass.id)).toEqual([expect.objectContaining({ reason, guardId: guard.user.id, method: "QR", direction: "ENTRY" })]);
  });

  it("un pase pendiente fuera de horario cuenta como aún no vigente o vencido", async () => {
    const house = await makeProperty("RJ-W");
    const guard = await authFor("GUARD");
    const early = await passOf("PENDING", "AXZ-EARLY", house.id, { from: HOUR, until: 2 * HOUR });
    const late = await passOf("PENDING", "AXZ-LATE", house.id, { from: -2 * HOUR, until: -HOUR });

    await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: early.code });
    await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: late.code });

    expect((await denied(early.id))[0].reason).toBe("NOT_YET_VALID");
    expect((await denied(late.id))[0].reason).toBe("EXPIRED");
  });

  it("forzar la entrada de un pase anulado responde error y también queda el rechazo", async () => {
    const house = await makeProperty("RJ-F");
    const guard = await authFor("GUARD");
    const pass = await passOf("CANCELLED", "AXZ-FORCE", house.id);

    const res = await request(app).put(`${api}/${pass.id}/status`).set("Authorization", guard.auth).send({ status: "ENTERED" });
    expect(res.status).toBe(409);
    expect((await denied(pass.id))[0].reason).toBe("REVOKED");
  });

  it("un pase válido o una visita dentro no cuentan como rechazo", async () => {
    const house = await makeProperty("RJ-OK");
    const guard = await authFor("GUARD");
    const pass = await passOf("PENDING", "AXZ-OK", house.id);

    await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: pass.code });
    await request(app).put(`${api}/${pass.id}/status`).set("Authorization", guard.auth).send({ status: "ENTERED" });
    await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: pass.code });

    expect(await denied(pass.id)).toEqual([]);
  });

  it("código inexistente responde 404; mantenimiento y residente no leen pases (403)", async () => {
    const guard = await authFor("GUARD");
    const maint = await authFor("MAINT");
    const resident = await authFor("RESDN");

    expect((await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: "AXZ-NOPE" })).status).toBe(404);
    expect((await request(app).post(`${api}/scan`).set("Authorization", guard.auth).send({ code: "" })).status).toBe(400);
    expect((await request(app).post(`${api}/scan`).set("Authorization", maint.auth).send({ code: "AXZ-1" })).status).toBe(403);
    expect((await request(app).post(`${api}/scan`).set("Authorization", resident.auth).send({ code: "AXZ-1" })).status).toBe(403);
  });
});

describe("indicadores por periodo", () => {
  const visitWith = async (propertyId: number, type: string, code: string, times: { entry: Date; exit?: Date; validUntil?: Date }) => {
    const owner = await authFor("RESDN");
    return prisma.invitation.create({
      data: {
        code,
        guestName: "Visita",
        createdById: owner.user.id,
        propertyId,
        typeId: await typeId(type),
        status: times.exit ? "EXITED" : "ENTERED",
        validFrom: new Date(times.entry.getTime() - HOUR),
        validUntil: times.validUntil ?? new Date(times.entry.getTime() + 24 * HOUR),
        entryTime: times.entry,
        exitTime: times.exit ?? null,
      },
    });
  };

  it("cuadra visitas, entregas, excedidas y sin salida por día, semana y mes", async () => {
    const house = await makeProperty("PR-1");
    const admin = await authFor("ADMIN");
    const t = (iso: string) => new Date(iso);

    // Lunes 5 y martes 6 de octubre de 2026 (misma semana); jueves 1 está en la semana anterior.
    await visitWith(house.id, "VISITOR", "AXZ-P1", { entry: t("2026-10-05T18:00:00Z"), exit: t("2026-10-05T19:00:00Z") });
    await visitWith(house.id, "DELIVERY", "AXZ-P2", { entry: t("2026-10-06T18:00:00Z"), exit: t("2026-10-06T18:10:00Z") });
    await visitWith(house.id, "VISITOR", "AXZ-P3", { entry: t("2026-10-01T18:00:00Z"), exit: t("2026-10-02T08:00:00Z") });
    await visitWith(house.id, "VISITOR", "AXZ-P4", { entry: t("2026-09-30T18:00:00Z"), validUntil: t("2026-09-30T22:00:00Z") });

    const res = await request(app)
      .get(`${api}/stats`)
      .query({ from: "2026-09-29T00:00:00Z", to: "2026-10-07T00:00:00Z" })
      .set("Authorization", admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ entries: 4, deliveries: 1, exceededStay: 1, noExit: 1 });
    expect(res.body.data.byMonth).toEqual([
      { period: "2026-09", count: 1, deliveries: 0 },
      { period: "2026-10", count: 3, deliveries: 1 },
    ]);
    expect(res.body.data.byWeek).toEqual([
      { period: "2026-09-28", count: 2, deliveries: 0 },
      { period: "2026-10-05", count: 2, deliveries: 1 },
    ]);
    expect(res.body.data.byDay).toEqual([
      { period: "2026-09-30", count: 1, deliveries: 0 },
      { period: "2026-10-01", count: 1, deliveries: 0 },
      { period: "2026-10-05", count: 1, deliveries: 0 },
      { period: "2026-10-06", count: 1, deliveries: 1 },
    ]);
  });

  it("los motivos de rechazo salen en español", async () => {
    const house = await makeProperty("PR-2");
    const admin = await authFor("ADMIN");
    await prisma.accessEvent.create({
      data: { propertyId: house.id, method: "QR", direction: "ENTRY", source: "GUARD", decision: "DENIED", reason: "ALREADY_USED" },
    });

    const res = await request(app)
      .get(`${api}/stats`)
      .query({ from: new Date(Date.now() - HOUR).toISOString(), to: new Date(Date.now() + HOUR).toISOString() })
      .set("Authorization", admin.auth);

    expect(res.body.data.rejected).toEqual({ total: 1, byReason: [{ reason: "ALREADY_USED", label: "Pase ya usado", count: 1 }] });
  });
});

describe("preferencia de avisos y PDF", () => {
  it("el residente apaga los avisos de entrada, pero sigue recibiendo las solicitudes de autorización", async () => {
    const house = await makeProperty("PF-1");
    const resident = await makeResident(house.id);
    const guard = await authFor("GUARD");

    expect((await request(app).get(`${api}/visit-alerts`).set("Authorization", resident.auth)).body.data).toEqual({ enabled: true });
    const off = await request(app).put(`${api}/visit-alerts`).set("Authorization", resident.auth).send({ enabled: false });
    expect(off.body.data).toEqual({ enabled: false });

    const created = await request(app).post(api).set("Authorization", guard.auth).send(walkIn(house.id, await typeId("VISITOR")));
    await request(app).put(`${api}/${created.body.data.id}/approval`).set("Authorization", resident.auth).send({ decision: "APPROVE" });
    await request(app).put(`${api}/${created.body.data.id}/status`).set("Authorization", guard.auth).send({ status: "ENTERED" });

    expect(await notificationsOf("INVITATION_APPROVAL")).toHaveLength(1);
    expect(await notificationsOf("INVITATION_ENTERED")).toHaveLength(0);
  });

  it("el guardia no tiene preferencia de residente (403)", async () => {
    const guard = await authFor("GUARD");
    expect((await request(app).put(`${api}/visit-alerts`).set("Authorization", guard.auth).send({ enabled: false })).status).toBe(403);
  });

  it("el admin descarga los indicadores en PDF; el guardia no", async () => {
    const admin = await authFor("ADMIN");
    const guard = await authFor("GUARD");
    const query = { from: new Date(Date.now() - 24 * HOUR).toISOString(), to: new Date().toISOString() };

    const pdf = await request(app).get(`${api}/stats/export.pdf`).query(query).set("Authorization", admin.auth).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect((await request(app).get(`${api}/stats/export.pdf`).query(query).set("Authorization", guard.auth)).status).toBe(403);
  });

  it("el admin descarga los indicadores en Excel con una hoja por indicador; el guardia no", async () => {
    const admin = await authFor("ADMIN");
    const guard = await authFor("GUARD");
    const query = { from: new Date(Date.now() - 24 * HOUR).toISOString(), to: new Date().toISOString() };

    const file = await downloadBinary(`${api}/stats/export.xlsx`, query, admin.auth);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("spreadsheetml.sheet");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.body as ArrayBuffer);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Por día", "Por semana", "Por mes", "Por hora", "Por casa", "Rechazos"]);
    expect(book.getWorksheet("Resumen")!.getRow(4).values).toEqual([undefined, "Entradas", 0]);

    expect((await request(app).get(`${api}/stats/export.xlsx`).query(query).set("Authorization", guard.auth)).status).toBe(403);
  });
});
