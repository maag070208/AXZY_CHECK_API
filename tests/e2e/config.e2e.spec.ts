/**
 * Flujos: ajustes del cliente, edificios, chat del equipo y token de tiempo real.
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

describe("ajustes del cliente", () => {
  const ST = `${V1}/settings`;

  beforeEach(async () => {
    await prisma.appSetting.createMany({
      data: [
        { key: "demo.texto", valueType: "string", value: "hola", group: "demo" },
        { key: "demo.entero", valueType: "int", value: "5", group: "demo" },
        { key: "demo.bandera", valueType: "bool", value: "true", group: "demo" },
        { key: "demo.secreto", valueType: "string", value: "no-salir", group: "demo", isSecret: true },
      ],
    });
  });

  it("camino feliz: ADMIN lista (sin secretos) y edita cada tipo", async () => {
    const list = expectOk(await api().get(ST).set("Authorization", s.admin.auth));
    const keys = list.map((x: any) => x.key);
    expect(keys).toEqual(expect.arrayContaining(["demo.texto", "demo.entero", "demo.bandera", "app.timezone"]));
    expect(keys).not.toContain("demo.secreto");
    expect(JSON.stringify(list)).not.toContain("no-salir");

    expect(expectOk(await api().put(`${ST}/demo.texto`).set("Authorization", s.admin.auth).send({ value: "adiós" }))).toMatchObject({ key: "demo.texto", value: "adiós" });
    expectOk(await api().put(`${ST}/demo.entero`).set("Authorization", s.admin.auth).send({ value: "-12" }));
    expectOk(await api().put(`${ST}/demo.bandera`).set("Authorization", s.admin.auth).send({ value: "false" }));
    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key: "demo.entero" } })).value).toBe("-12");
  });

  it.each([
    ["entero con texto", "demo.entero", "cinco"],
    ["entero decimal", "demo.entero", "5.5"],
    ["booleano con texto", "demo.bandera", "si"],
    ["booleano en mayúsculas", "demo.bandera", "TRUE"],
  ])("rechaza un valor de tipo incorrecto: %s → 400", async (_n, key, value) => {
    expectFail(await api().put(`${ST}/${key}`).set("Authorization", s.admin.auth).send({ value }), 400, "SETTING_INVALID_VALUE");
    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key } })).value).not.toBe(value);
  });

  it("validación: valor ausente, no texto o demasiado largo; clave con caracteres raros; ajuste inexistente", async () => {
    expectFail(await api().put(`${ST}/demo.texto`).set("Authorization", s.admin.auth).send({}), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${ST}/demo.texto`).set("Authorization", s.admin.auth).send({ value: 5 }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${ST}/demo.texto`).set("Authorization", s.admin.auth).send({ value: "x".repeat(501) }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${ST}/clave con espacios`).set("Authorization", s.admin.auth).send({ value: "x" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${ST}/no.existe`).set("Authorization", s.admin.auth).send({ value: "x" }), 404, "SETTING_NOT_FOUND");
  });

  it("solo ADMIN: SHIFT, GUARD, MAINT y residentes → 403", async () => {
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().get(ST).set("Authorization", s[key].auth), 403);
      expectFail(await api().put(`${ST}/demo.texto`).set("Authorization", s[key].auth).send({ value: "x" }), 403);
    }
    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key: "demo.texto" } })).value).toBe("hola");
  });

  it("cambiar la zona horaria surte efecto en la siguiente lectura (caché invalidada)", async () => {
    expectOk(await api().put(`${ST}/app.timezone`).set("Authorization", s.admin.auth).send({ value: "America/Tijuana" }));
    const { getSetting } = await import("@src/core/settings/app-settings.service");
    expect(await getSetting("app.timezone", "UTC")).toBe("America/Tijuana");
  });
});

describe("edificios", () => {
  const B = `${V1}/buildings`;

  it("camino feliz: crear → listar → editar → desactivar", async () => {
    const created = expectOk(await api().post(B).set("Authorization", s.admin.auth).send({ name: "Torre Norte", floors: 12 }), 201);
    expect(created).toMatchObject({ name: "Torre Norte", floors: 12, active: true });
    const list = expectOk(await api().get(B).set("Authorization", s.shift.auth));
    expect(list.map((b: any) => b.name)).toEqual(["Torre Flujo", "Torre Norte"]);
    expect(expectOk(await api().put(`${B}/${created.id}`).set("Authorization", s.admin.auth).send({ floors: 14, active: "false" }))).toMatchObject({ floors: 14, active: false });
  });

  it.each([
    ["sin nombre", {}],
    ["nombre vacío", { name: "  " }],
    ["pisos en cero", { name: "X", floors: 0 }],
    ["pisos fuera de rango", { name: "X", floors: 201 }],
    ["pisos decimales", { name: "X", floors: 2.5 }],
    ["pisos como texto", { name: "X", floors: "diez" }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(B).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("nombre duplicado → 409; editar inexistente → 404", async () => {
    expectFail(await api().post(B).set("Authorization", s.admin.auth).send({ name: "Torre Flujo" }), 409, "BUILDING_EXISTS");
    const other = expectOk(await api().post(B).set("Authorization", s.admin.auth).send({ name: "Torre Sur" }), 201);
    expectFail(await api().put(`${B}/${other.id}`).set("Authorization", s.admin.auth).send({ name: "Torre Flujo" }), 409, "BUILDING_EXISTS");
    expectFail(await api().put(`${B}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "Z" }), 404, "BUILDING_NOT_FOUND");
  });

  it("lectura con properties.view (ADMIN, SHIFT); escritura solo ADMIN; MAINT y residentes sin acceso", async () => {
    expectFail(await api().get(B).set("Authorization", s.maint.auth), 403);
    expectFail(await api().get(B).set("Authorization", s.resident.auth), 403);
    expectFail(await api().post(B).set("Authorization", s.shift.auth).send({ name: "Otra" }), 403);
    expectFail(await api().put(`${B}/${flows.properties.buildingId}`).set("Authorization", s.guard1.auth).send({ name: "Otra" }), 403);
  });
});

describe("chat del equipo", () => {
  const C = `${V1}/chat/messages`;

  it("camino feliz: enviar, listar (más recientes primero) y paginar por cursor", async () => {
    for (const msg of ["uno", "dos", "tres"]) expectOk(await api().post(C).set("Authorization", s.guard2.auth).send({ message: msg }), 201);
    const all = expectOk(await api().get(C).set("Authorization", s.maint.auth));
    expect(all.map((m: any) => m.message)).toEqual(["tres", "dos", "uno", "Flujo · inicio de turno"]);
    expect(all[0].user).toMatchObject({ id: s.guard2.id, role: { name: "GUARD" } });
    expect(JSON.stringify(all)).not.toMatch(/password/);
    const page = expectOk(await api().get(`${C}?limit=2`).set("Authorization", s.admin.auth));
    expect(page).toHaveLength(2);
    const older = expectOk(await api().get(`${C}?limit=2&cursor=${page[1].id}`).set("Authorization", s.admin.auth));
    expect(older.map((m: any) => m.message)).toEqual(["uno", "Flujo · inicio de turno"]);
  });

  it("el mensaje se recorta; vacío, solo espacios, sin cuerpo, tipo incorrecto o enorme → 400", async () => {
    expect(expectOk(await api().post(C).set("Authorization", s.shift.auth).send({ message: "  hola  " }), 201).message).toBe("hola");
    expectFail(await api().post(C).set("Authorization", s.shift.auth).send({ message: "   " }), 400);
    expectFail(await api().post(C).set("Authorization", s.shift.auth).send({}), 400, "VALIDATION_ERROR");
    expectFail(await api().post(C).set("Authorization", s.shift.auth).send({ message: 42 }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(C).set("Authorization", s.shift.auth).send({ message: "x".repeat(2001) }), 400, "VALIDATION_ERROR");
  });

  it("parámetros de paginación inválidos no producen 500 ni listas sin tope", async () => {
    for (const q of ["limit=abc", "cursor=abc", "limit=-3", "limit=0"]) {
      const res = await api().get(`${C}?${q}`).set("Authorization", s.admin.auth);
      expect(res.status).toBeLessThan(500);
    }
    for (let i = 0; i < 3; i++) await prisma.chatMessage.create({ data: { userId: s.admin.id, message: `m${i}` } });
    const huge = await api().get(`${C}?limit=100000`).set("Authorization", s.admin.auth);
    expect(huge.status).toBe(200);
    expect(huge.body.data.length).toBeLessThanOrEqual(200);
  });

  it("los residentes no participan en el chat → 403; sin token → 401", async () => {
    expectFail(await api().get(C).set("Authorization", s.resident.auth), 403);
    expectFail(await api().post(C).set("Authorization", s.resident.auth).send({ message: "hola" }), 403);
    expectFail(await api().get(C), 401);
  });
});

describe("token de tiempo real", () => {
  it("sin servicio configurado responde 503 (el cliente cae a sondeo); sin token → 401", async () => {
    expectFail(await api().get(`${V1}/realtime/token`).set("Authorization", s.guard1.auth), 503);
    expectFail(await api().get(`${V1}/realtime/token`), 401);
  });
});
