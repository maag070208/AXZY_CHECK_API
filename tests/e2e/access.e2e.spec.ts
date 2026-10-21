/**
 * Flujo: accesos a la comunidad. Invitaciones de visita (código, ventana de validez, entrada/salida)
 * y personas autorizadas con horario y pase permanente.
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;
let visitor: number;
let provider: number;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
  visitor = (await prisma.invitationType.findUniqueOrThrow({ where: { name: "VISITOR" } })).id;
  provider = (await prisma.invitationType.findUniqueOrThrow({ where: { name: "PROVIDER" } })).id;
});
afterAll(disconnectDatabase);

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe("invitaciones", () => {
  const I = `${V1}/invitations`;
  const body = (over: Record<string, unknown> = {}) => ({
    guestName: "Tomás Visitante", propertyId: flows.properties.houseId, typeId: visitor, validFrom: hours(-1), validUntil: hours(5), notes: "Viene en auto gris", ...over,
  });

  it("camino feliz: la residente crea → consulta por id y por código → la caseta marca entrada y salida", async () => {
    const created = expectOk(await api().post(I).set("Authorization", s.resident.auth).send(body()), 201);
    expect(created).toMatchObject({ guestName: "Tomás Visitante", status: "PENDING", createdById: s.resident.id });
    expect(created.code).toMatch(/^AXZ-[A-Z0-9]{6}$/);

    expect(expectOk(await api().get(`${I}/${created.id}`).set("Authorization", s.resident.auth)).code).toBe(created.code);
    const byCode = expectOk(await api().get(`${I}/${created.code}`).set("Authorization", s.guard1.auth));
    expect(byCode.id).toBe(created.id);
    expect(JSON.stringify(byCode)).not.toMatch(/password/);

    const entered = expectOk(await api().put(`${I}/${created.id}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }));
    expect(entered.status).toBe("ENTERED");
    expect(entered.entryTime).toBeTruthy();
    const exited = expectOk(await api().put(`${I}/${created.id}/status`).set("Authorization", s.guard1.auth).send({ status: "EXITED" }));
    expect(exited.exitTime).toBeTruthy();
  });

  it("la residente revoca su invitación con motivo, que queda en las notas", async () => {
    const created = expectOk(await api().post(I).set("Authorization", s.resident.auth).send(body()), 201);
    const cancelled = expectOk(await api().put(`${I}/${created.id}/status`).set("Authorization", s.resident.auth).send({ status: "CANCELLED", reason: "Ya no viene" }));
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.notes).toContain("[Revocación] Ya no viene");
    expectFail(await api().put(`${I}/${created.id}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 409, "INVALID_TRANSITION");
  });

  it("datatable: filtros por estado, tipo, propiedad y búsqueda por código o invitado", async () => {
    const all = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: {} }));
    expect(all.total).toBe(4);
    expect(expectOk(await api().post(`${I}/datatable`).set("Authorization", s.guard1.auth).send({ page: 1, limit: 10, filters: { status: "ENTERED" } })).rows.map((r: any) => r.code)).toEqual(["FLUJO-INV-ENTERED"]);
    expect(expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { typeId: provider } })).total).toBe(0);
    expect(expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { propertyId: flows.properties.vacantId } })).total).toBe(0);
    expect(expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "flujo-inv-exited" } })).total).toBe(1);
    expect(expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "INVITADO CANCELLED" } })).total).toBe(1);
    const page = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 2, limit: 3, filters: {} }));
    expect(page.rows).toHaveLength(1);
  });

  it("un residente solo ve y maneja SUS invitaciones aunque omita el filtro del cliente", async () => {
    const other = expectOk(await api().post(`${V1}/residents`).set("Authorization", s.admin.auth).send({ name: "Vecino", username: "vecino_uno", password: "clave-vecino-1", propertyId: flows.properties.vacantId }), 201);
    const neighbor = `Bearer ${(await (await import("./support")).loginReal("vecino_uno", "clave-vecino-1")).body.data}`;
    const created = expectOk(await api().post(I).set("Authorization", neighbor).send(body({ propertyId: flows.properties.vacantId, guestName: "Visita del vecino" })), 201);

    const mine = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.resident.auth).send({ page: 1, limit: 50, filters: {} }));
    expect(mine.total).toBe(4);
    expect(mine.rows.map((r: any) => r.guestName)).not.toContain("Visita del vecino");
    const forced = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.resident.auth).send({ page: 1, limit: 50, filters: { createdById: other.id } }));
    expect(forced.rows.map((r: any) => r.guestName)).not.toContain("Visita del vecino");

    expectFail(await api().get(`${I}/${created.id}`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(`${I}/${created.code}`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().put(`${I}/${created.id}/status`).set("Authorization", s.resident.auth).send({ status: "CANCELLED" }), 403);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("PENDING");
    // El personal sí ve todas.
    expect(expectOk(await api().post(`${I}/datatable`).set("Authorization", s.guard1.auth).send({ page: 1, limit: 50, filters: {} })).total).toBe(5);
  });

  it("el residente solo invita a SU propiedad y no puede marcar entradas ni salidas", async () => {
    expectFail(await api().post(I).set("Authorization", s.resident.auth).send(body({ propertyId: flows.properties.apartmentId })), 403);
    expect(await prisma.invitation.count({ where: { propertyId: flows.properties.apartmentId } })).toBe(0);
    const mine = expectOk(await api().post(I).set("Authorization", s.resident.auth).send(body()), 201);
    expectFail(await api().put(`${I}/${mine.id}/status`).set("Authorization", s.resident.auth).send({ status: "ENTERED" }), 403);
    // El personal sí invita para cualquier propiedad.
    expectOk(await api().post(I).set("Authorization", s.admin.auth).send(body({ propertyId: flows.properties.apartmentId })), 201);
  });

  it("la entrada solo se permite dentro de la ventana de validez", async () => {
    const future = expectOk(await api().post(I).set("Authorization", s.admin.auth).send(body({ validFrom: hours(3), validUntil: hours(6) })), 201);
    expectFail(await api().put(`${I}/${future.id}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 409, "INVITATION_NOT_VALID");
    const expired = expectOk(await api().post(I).set("Authorization", s.admin.auth).send(body({ validFrom: hours(-8), validUntil: hours(-2) })), 201);
    expectFail(await api().put(`${I}/${expired.id}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 409, "INVITATION_NOT_VALID");
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("PENDING");
    // Cancelar una expirada sí se permite.
    expectOk(await api().put(`${I}/${expired.id}/status`).set("Authorization", s.admin.auth).send({ status: "CANCELLED" }));
  });

  it("transiciones inválidas → 409; estado desconocido → 400; inexistente → 404", async () => {
    const pending = flows.access.invitationIds.PENDING;
    const exited = flows.access.invitationIds.EXITED;
    expectFail(await api().put(`${I}/${pending}/status`).set("Authorization", s.guard1.auth).send({ status: "EXITED" }), 409, "INVALID_TRANSITION");
    expectFail(await api().put(`${I}/${exited}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 409, "INVALID_TRANSITION");
    expectFail(await api().put(`${I}/${flows.access.invitationIds.CANCELLED}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 409, "INVALID_TRANSITION");
    expectFail(await api().put(`${I}/${pending}/status`).set("Authorization", s.guard1.auth).send({ status: "EXPIRED" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${I}/${pending}/status`).set("Authorization", s.guard1.auth).send({}), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${I}/${MISSING_ID}/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 404, "INVITATION_NOT_FOUND");
    expectFail(await api().put(`${I}/abc/status`).set("Authorization", s.guard1.auth).send({ status: "ENTERED" }), 400, "VALIDATION_ERROR");
  });

  it.each([
    ["sin invitado", { guestName: undefined }],
    ["invitado vacío", { guestName: "  " }],
    ["invitado largo", { guestName: "x".repeat(121) }],
    ["sin propiedad", { propertyId: undefined }],
    ["sin tipo", { typeId: undefined }],
    ["fecha inicial inválida", { validFrom: "mañana" }],
    ["fin antes del inicio", { validFrom: hours(5), validUntil: hours(1) }],
    ["fin igual al inicio", { validFrom: "2030-01-01T10:00:00Z", validUntil: "2030-01-01T10:00:00Z" }],
    ["notas enormes", { notes: "x".repeat(2001) }],
  ])("valida la entrada: %s → 400", async (_n, over) => {
    const before = await prisma.invitation.count();
    expectFail(await api().post(I).set("Authorization", s.admin.auth).send(body(over)), 400, "VALIDATION_ERROR");
    expect(await prisma.invitation.count()).toBe(before);
  });

  it("propiedad o tipo inexistente → 4xx sin filtrar detalles; el creador sale del token", async () => {
    expect([404, 400]).toContain((await api().post(I).set("Authorization", s.admin.auth).send(body({ propertyId: MISSING_ID }))).status);
    expectFail(await api().post(I).set("Authorization", s.admin.auth).send(body({ typeId: MISSING_ID })), 400);
    const created = expectOk(await api().post(I).set("Authorization", s.shift.auth).send({ ...body(), createdById: s.admin.id }), 201);
    expect(created.createdById).toBe(s.shift.id);
  });

  it("consultar un id o código inexistente → 404; datatable con entradas raras no da 500; sin token → 401", async () => {
    expectFail(await api().get(`${I}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().get(`${I}/NO-EXISTE`).set("Authorization", s.admin.auth), 404);
    for (const b of [{}, { page: 1, limit: 10, filters: { status: "NOEXISTE" } }, { page: 1, limit: 10, filters: { typeId: "abc" } }, { page: 1, limit: 10, filters: { campoRaro: "x" } }]) {
      expect((await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send(b)).status).toBeLessThan(500);
    }
    expectFail(await api().get(I), 401);
    expectFail(await api().post(I).send(body()), 401);
  });
});

describe("personas autorizadas", () => {
  const A = (propertyId: number) => `${V1}/properties/${propertyId}/authorizations`;
  const body = (personId: number, over: Record<string, unknown> = {}) => ({
    personId, scope: "PEDESTRIAN", days: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59", validFrom: "2026-01-01", ...over,
  });
  const check = (personId: number, scope = "PEDESTRIAN", propertyId = flows.properties.houseId) =>
    `${V1}/authorizations/check?propertyId=${propertyId}&personId=${personId}&scope=${scope}`;
  const todayWeekday = () => new Date().getUTCDay();

  it("camino feliz: autorizar → consultar en caseta → pase permanente → revocar", async () => {
    const maid = flows.access.authorizedPersonId;
    const created = expectOk(await api().post(A(flows.properties.houseId)).set("Authorization", s.admin.auth).send(body(maid, { scope: "BOTH" })), 201);
    expect(created).toMatchObject({ personId: maid, scope: "BOTH", days: "0,1,2,3,4,5,6", createdById: s.admin.id });

    const list = expectOk(await api().get(A(flows.properties.houseId)).set("Authorization", s.shift.auth));
    expect(list).toHaveLength(2);
    expect(list[0].person).toMatchObject({ firstName: "Dora" });

    expect(expectOk(await api().get(check(maid, "VEHICLE")).set("Authorization", s.guard1.auth))).toEqual({ decision: "AUTHORIZED", reason: "IN_SCHEDULE" });

    const issued = expectOk(await api().post(`${V1}/authorizations/${created.id}/pass`).set("Authorization", s.admin.auth), 201);
    expect(issued.token.length).toBeGreaterThanOrEqual(40);
    const row = await prisma.propertyAuthorization.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.passHash).toBeTruthy();
    expect(row.passHash).not.toContain(issued.token);

    const verified = expectOk(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s.guard1.auth).send({ token: issued.token, scope: "PEDESTRIAN" }));
    expect(verified).toMatchObject({ decision: "AUTHORIZED", person: { firstName: "Dora" } });
    // Emitir otro pase invalida el anterior.
    const reissued = expectOk(await api().post(`${V1}/authorizations/${created.id}/pass`).set("Authorization", s.admin.auth), 201);
    expect(expectOk(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s.guard1.auth).send({ token: issued.token })).decision).toBe("DENIED");
    expect(expectOk(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s.guard1.auth).send({ token: reissued.token })).decision).toBe("AUTHORIZED");

    expectOk(await api().post(`${V1}/authorizations/${created.id}/revoke`).set("Authorization", s.admin.auth));
    expect(expectOk(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s.guard1.auth).send({ token: reissued.token }))).toMatchObject({ decision: "DENIED", reason: "REVOKED" });
    expectFail(await api().post(`${V1}/authorizations/${created.id}/pass`).set("Authorization", s.admin.auth), 409, "AUTHORIZATION_REVOKED");
    expectOk(await api().post(`${V1}/authorizations/${created.id}/revoke`).set("Authorization", s.admin.auth));
  });

  it("decisiones de la caseta: alcance, vigencia, día y hora", async () => {
    const person = await prisma.person.create({ data: { firstName: "Visitante" } });
    const { houseId } = flows.properties;
    const mk = async (over: Record<string, unknown>) => expectOk(await api().post(A(houseId)).set("Authorization", s.admin.auth).send(body(person.id, over)), 201);

    await mk({ scope: "VEHICLE" });
    expect(expectOk(await api().get(check(person.id, "PEDESTRIAN")).set("Authorization", s.guard1.auth))).toEqual({ decision: "DENIED", reason: "SCOPE_MISMATCH" });
    await mk({ validFrom: "2999-01-01" });
    expect(expectOk(await api().get(check(person.id)).set("Authorization", s.guard1.auth)).reason).toBe("NOT_YET_VALID");
    await mk({ validFrom: "2020-01-01", validUntil: "2020-12-31" });
    expect(expectOk(await api().get(check(person.id)).set("Authorization", s.guard1.auth)).reason).toBe("EXPIRED");
    await mk({ days: [(todayWeekday() + 1) % 7] });
    const outside = expectOk(await api().get(check(person.id)).set("Authorization", s.guard1.auth));
    expect(outside).toEqual({ decision: "NEEDS_APPROVAL", reason: "OUT_OF_SCHEDULE" });
    expect(expectOk(await api().get(check(person.id, "PEDESTRIAN", flows.properties.vacantId)).set("Authorization", s.guard1.auth))).toEqual({ decision: "DENIED", reason: "NO_AUTHORIZATION" });
  });

  it("fuera de horario avisa a la titular una sola vez por ventana de 15 minutos", async () => {
    const person = await prisma.person.create({ data: { firstName: "Tarde", phone: "5550170" } });
    expectOk(await api().post(A(flows.properties.houseId)).set("Authorization", s.admin.auth).send(body(person.id, { days: [(todayWeekday() + 1) % 7] })), 201);
    for (let i = 0; i < 3; i++) expect(expectOk(await api().get(check(person.id)).set("Authorization", s.guard1.auth)).decision).toBe("NEEDS_APPROVAL");
    const events = await prisma.outboxEvent.findMany({ where: { type: "notification.send" } });
    expect(events).toHaveLength(1);
    expect((events[0].payload as any).userIds).toEqual([s.resident.id]);
  });

  it.each([
    ["sin persona", { personId: undefined }],
    ["sin días", { days: [] }],
    ["día fuera de rango", { days: [7] }],
    ["hora inválida", { startTime: "25:00" }],
    ["hora sin formato", { endTime: "tarde" }],
    ["alcance desconocido", { scope: "AVION" }],
    ["fecha inválida", { validFrom: "pronto" }],
    ["vigencia final anterior a la inicial", { validFrom: "2026-05-01", validUntil: "2026-04-01" }],
  ])("valida la entrada: %s → 400", async (_n, over) => {
    expectFail(await api().post(A(flows.properties.houseId)).set("Authorization", s.admin.auth).send({ ...body(flows.access.authorizedPersonId), ...over }), 400, "VALIDATION_ERROR");
  });

  it("horario con inicio igual al fin → 400; persona o propiedad inexistente → 404", async () => {
    const maid = flows.access.authorizedPersonId;
    expectFail(await api().post(A(flows.properties.houseId)).set("Authorization", s.admin.auth).send(body(maid, { startTime: "10:00", endTime: "10:00" })), 400, "SCHEDULE_INVALID");
    expectFail(await api().post(A(flows.properties.houseId)).set("Authorization", s.admin.auth).send(body(MISSING_ID)), 404, "PERSON_NOT_FOUND");
    expectFail(await api().post(A(MISSING_ID)).set("Authorization", s.admin.auth).send(body(maid)), 404, "PROPERTY_NOT_FOUND");
  });

  it("consulta de caseta con parámetros inválidos → 400; pase desconocido o malformado", async () => {
    expectFail(await api().get(`${V1}/authorizations/check`).set("Authorization", s.guard1.auth), 400, "VALIDATION_ERROR");
    expectFail(await api().get(`${V1}/authorizations/check?propertyId=abc&personId=1`).set("Authorization", s.guard1.auth), 400, "VALIDATION_ERROR");
    expectFail(await api().get(`${V1}/authorizations/check?propertyId=1&personId=1&scope=BOTH`).set("Authorization", s.guard1.auth), 400, "VALIDATION_ERROR");
    expectFail(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s.guard1.auth).send({ token: "corto" }), 400, "VALIDATION_ERROR");
    expect(expectOk(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s.guard1.auth).send({ token: "x".repeat(43) }))).toEqual({ decision: "DENIED", reason: "UNKNOWN_PASS", person: null });
    expectFail(await api().post(`${V1}/authorizations/${MISSING_ID}/pass`).set("Authorization", s.admin.auth), 404, "AUTHORIZATION_NOT_FOUND");
    expectFail(await api().post(`${V1}/authorizations/${MISSING_ID}/revoke`).set("Authorization", s.admin.auth), 404, "AUTHORIZATION_NOT_FOUND");
    expectFail(await api().post(`${V1}/authorizations/abc/revoke`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");
  });

  it("permisos: alta, pase y revocación solo ADMIN; caseta (consulta/verificación) ADMIN, SHIFT y GUARD; MAINT y residentes sin acceso", async () => {
    const maid = flows.access.authorizedPersonId;
    const id = flows.access.authorizationId;
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().post(A(flows.properties.houseId)).set("Authorization", s[key].auth).send(body(maid)), 403);
      expectFail(await api().post(`${V1}/authorizations/${id}/pass`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${V1}/authorizations/${id}/revoke`).set("Authorization", s[key].auth), 403);
    }
    for (const key of ["maint", "resident"]) {
      expectFail(await api().get(check(maid)).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${V1}/authorizations/pass/verify`).set("Authorization", s[key].auth).send({ token: "x".repeat(43) }), 403);
    }
    for (const key of ["guard1", "maint", "resident"]) expectFail(await api().get(A(flows.properties.houseId)).set("Authorization", s[key].auth), 403);
    expectOk(await api().get(check(maid)).set("Authorization", s.shift.auth));
    expectFail(await api().get(check(maid)), 401);
  });
});
