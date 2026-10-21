/**
 * Flujo: autenticación, usuarios y roles. Camino feliz completo, errores de entrada,
 * autorización por rol y reglas de negocio, contra la app Express real.
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { FLOW_PASSWORD, FLOW_USERS } from "../../prisma/seeds/flows";
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, loginReal, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<keyof typeof FLOW_USERS, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

const newUser = (over: Record<string, unknown> = {}) => ({
  name: "Nuevo",
  lastName: "Usuario",
  username: "nuevo_usuario",
  password: "clave-segura-1",
  role: "GUARD",
  ...over,
});

describe("login y sesión", () => {
  it("camino feliz: el token trae la identidad y abre rutas protegidas", async () => {
    const res = await loginReal("flow_admin");
    const token = expectOk(res);
    const payload: any = jwt.verify(token, process.env.APP_SECRET as string);
    expect(payload).toMatchObject({ username: "flow_admin", role: "ADMIN" });
    expect(payload).not.toHaveProperty("password");
    expectOk(await api().get(`${V1}/users`).set("Authorization", `Bearer ${token}`));
    const me = await prisma.user.findUniqueOrThrow({ where: { username: "flow_admin" } });
    expect(me.isLoggedIn).toBe(true);
  });

  it("rechaza contraseña errónea y usuario inexistente con el MISMO mensaje (sin enumerar usuarios)", async () => {
    const wrongPass = await loginReal("flow_admin", "incorrecta");
    const unknown = await loginReal("nadie_existe", "incorrecta");
    expectFail(wrongPass, 401);
    expectFail(unknown, 401);
    expect(wrongPass.body.messages).toEqual(unknown.body.messages);
  });

  it.each([
    ["sin cuerpo", {}],
    ["sin contraseña", { username: "flow_admin" }],
    ["sin usuario", { password: "x" }],
    ["usuario vacío", { username: "   ", password: "x" }],
    ["tipos incorrectos", { username: 123, password: ["a"] }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(`${V1}/users/login`).send(body), 400, "VALIDATION_ERROR");
  });

  it("no inicia sesión con un usuario desactivado ni eliminado", async () => {
    await prisma.user.update({ where: { username: "flow_admin" }, data: { active: false } });
    expect((await loginReal("flow_admin")).status).toBeGreaterThanOrEqual(401);
    expect((await loginReal("flow_admin")).status).toBeLessThan(500);
    expect((await loginReal("flow_admin")).body.success).toBe(false);
    await prisma.user.update({ where: { username: "flow_shift" }, data: { softDelete: true } });
    expectFail(await loginReal("flow_shift"), 401);
  });

  it("personal operativo sin horario asignado → 403", async () => {
    await prisma.user.update({ where: { username: "flow_guard1" }, data: { scheduleId: null } });
    expectFail(await loginReal("flow_guard1"), 403);
  });

  it("personal operativo fuera de su horario de turno → 403; dentro → 200", async () => {
    const now = new Date();
    const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const later = (h: number) => new Date(now.getTime() + h * 3600_000);
    const outside = await prisma.schedule.create({ data: { name: "Fuera de hora", startTime: hhmm(later(2)), endTime: hhmm(later(3)) } });
    const inside = await prisma.schedule.create({ data: { name: "En turno nocturno", startTime: hhmm(later(-1)), endTime: hhmm(later(-2)) } });
    await prisma.user.update({ where: { username: "flow_guard1" }, data: { scheduleId: outside.id } });
    expectFail(await loginReal("flow_guard1"), 403);
    // Turno que cruza la medianoche y que incluye la hora actual.
    await prisma.user.update({ where: { username: "flow_guard1" }, data: { scheduleId: inside.id } });
    expect((await loginReal("flow_guard1")).status).toBe(200);
  });

  it("la cuenta de residente no necesita horario", async () => {
    expect((await loginReal("flow_resident")).status).toBe(200);
  });

  it("logout marca la sesión como cerrada y exige token", async () => {
    await loginReal("flow_guard1");
    expectOk(await api().post(`${V1}/users/logout`).set("Authorization", s.guard1.auth));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.guard1.id } })).isLoggedIn).toBe(false);
    expect((await api().post(`${V1}/users/logout`)).status).toBe(401);
  });

  it("logout ignora un id en el cuerpo: nadie desconecta a otro", async () => {
    await prisma.user.update({ where: { id: s.admin.id }, data: { isLoggedIn: true } });
    await api().post(`${V1}/users/logout`).set("Authorization", s.guard1.auth).send({ id: s.admin.id, userId: s.admin.id });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.admin.id } })).isLoggedIn).toBe(true);
  });
});

describe("autenticación por token", () => {
  const secret = () => process.env.APP_SECRET as string;
  const claims = { id: 1, name: "X", lastName: "Y", username: "x", role: "ADMIN" };

  it.each([
    ["sin cabecera", undefined],
    ["esquema sin token", "Bearer"],
    ["token basura", "Bearer no-es-un-jwt"],
    ["firmado con otra clave", `Bearer ${jwt.sign(claims, "otra-clave")}`],
    ["vencido", `Bearer ${jwt.sign(claims, secret(), { expiresIn: -10 })}`],
    ["sin algoritmo (alg none)", `Bearer ${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`],
  ])("rechaza el token: %s → 401", async (_n, header) => {
    const req = api().get(`${V1}/users`);
    if (header) req.set("Authorization", header);
    expectFail(await req, 401);
  });

  it("un token con rol inexistente no obtiene permisos", async () => {
    const forged = jwt.sign({ ...claims, role: "SUPERADMIN" }, secret());
    expectFail(await api().get(`${V1}/users`).set("Authorization", `Bearer ${forged}`), 403);
  });
});

describe("alta de usuarios", () => {
  it("camino feliz: ADMIN crea un usuario, no se devuelve ni se guarda la clave en claro, y ya puede entrar", async () => {
    const res = await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser({ scheduleId: flows.staff.scheduleId }));
    const user = expectOk(res, 201);
    expect(user).toMatchObject({ username: "nuevo_usuario", name: "Nuevo" });
    expect(JSON.stringify(res.body)).not.toMatch(/clave-segura-1|password/);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.password).not.toBe("clave-segura-1");
    expect(await bcrypt.compare("clave-segura-1", row.password)).toBe(true);
    expect((await loginReal("nuevo_usuario", "clave-segura-1")).status).toBe(200);
  });

  it("un guardia nuevo recibe las rutas recurrentes activas", async () => {
    const user = expectOk(await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser()), 201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { recurringConfigurations: true } });
    expect(row.recurringConfigurations.map((r) => r.id)).toContain(flows.routes.configurationId);
  });

  it("acepta el rol por roleId", async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "MAINT" } });
    const res = await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser({ role: undefined, roleId: String(role.id), username: "mant_nuevo" }));
    expect(expectOk(res, 201).roleId).toBe(role.id);
  });

  it("rechaza un nombre de usuario repetido (aun entre mayúsculas distintas no se duplica la cuenta)", async () => {
    const res = await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser({ username: "flow_guard1" }));
    expectFail(res, 400);
    expect(await prisma.user.count({ where: { username: "flow_guard1" } })).toBe(1);
  });

  it.each([
    ["sin nombre", { name: undefined }],
    ["nombre vacío", { name: "  " }],
    ["usuario muy corto", { username: "ab" }],
    ["usuario muy largo", { username: "u".repeat(51) }],
    ["contraseña corta", { password: "12345" }],
    ["sin rol", { role: undefined }],
    ["horario con formato inválido", { shiftStart: "8am" }],
    ["tipos incorrectos", { name: 5, username: {}, password: [] }],
  ])("valida la entrada: %s → 400", async (_n, over) => {
    const before = await prisma.user.count();
    expectFail(await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser(over)), 400, "VALIDATION_ERROR");
    expect(await prisma.user.count()).toBe(before);
  });

  it("un rol o un horario inexistente es un error 4xx, no un 500", async () => {
    const badRole = await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser({ role: "NO_EXISTE", username: "u_rol_malo" }));
    expect(badRole.status).toBeGreaterThanOrEqual(400);
    expect(badRole.status).toBeLessThan(500);
    const badSchedule = await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser({ scheduleId: MISSING_ID, username: "u_horario_malo" }));
    expect(badSchedule.status).toBeGreaterThanOrEqual(400);
    expect(badSchedule.status).toBeLessThan(500);
    expect(await prisma.user.count({ where: { username: { in: ["u_rol_malo", "u_horario_malo"] } } })).toBe(0);
  });

  it.each(["shift", "guard1", "maint", "resident"] as const)("%s no puede crear usuarios → 403", async (key) => {
    expectFail(await api().post(`${V1}/users`).set("Authorization", s[key].auth).send(newUser()), 403);
  });
});

describe("consulta de usuarios", () => {
  it("lista completa y búsqueda por texto, sin claves", async () => {
    const all = expectOk(await api().get(`${V1}/users`).set("Authorization", s.admin.auth));
    expect(all).toHaveLength(6);
    expect(JSON.stringify(all)).not.toMatch(/password/);
    const found = expectOk(await api().get(`${V1}/users?q=Gabriela`).set("Authorization", s.shift.auth));
    expect(found.map((u: any) => u.username)).toEqual(["flow_guard1"]);
    expect(expectOk(await api().get(`${V1}/users?q=zzzz-sin-resultados`).set("Authorization", s.admin.auth))).toEqual([]);
  });

  it("datatable: paginación, orden, filtro y total", async () => {
    const page1 = expectOk(await api().post(`${V1}/users/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 4, filters: {}, sort: { key: "username", direction: "asc" } }));
    expect(page1.total).toBe(6);
    expect(page1.rows.map((u: any) => u.username)).toEqual(["flow_admin", "flow_guard1", "flow_guard2", "flow_maint"]);
    const page2 = expectOk(await api().post(`${V1}/users/datatable`).set("Authorization", s.admin.auth).send({ page: 2, limit: 4, filters: {}, sort: { key: "username", direction: "asc" } }));
    expect(page2.rows).toHaveLength(2);
    const filtered = expectOk(await api().post(`${V1}/users/datatable`).set("Authorization", s.shift.auth).send({ page: 1, limit: 10, filters: { username: "guard" } }));
    expect(filtered.total).toBe(2);
    expect(JSON.stringify(filtered)).not.toMatch(/password/);
  });

  it("datatable: filtra por tareas pendientes", async () => {
    await prisma.assignment.updateMany({ data: { guardId: s.guard2.id } });
    const pending = expectOk(await api().post(`${V1}/users/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { pendingTasks: true } }));
    expect(pending.rows.map((u: any) => u.username)).toEqual(["flow_guard2"]);
    const none = expectOk(await api().post(`${V1}/users/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { pendingTasks: false } }));
    expect(none.total).toBe(5);
  });

  it("datatable: entradas raras no producen 500 (sin cuerpo, filtro o columna desconocida, límite enorme)", async () => {
    for (const body of [{}, { page: 1, limit: 10, filters: { columnaQueNoExiste: "x" } }, { page: 1, limit: 10, sort: { key: "noExiste", direction: "asc" } }, { page: -5, limit: "abc" }]) {
      const res = await api().post(`${V1}/users/datatable`).set("Authorization", s.admin.auth).send(body);
      expect(res.status).toBeLessThan(500);
    }
    const huge = await api().post(`${V1}/users/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 100000000, filters: {} });
    expect(huge.status).toBeLessThan(500);
    if (huge.status === 200) expect(huge.body.data.rows.length).toBeLessThanOrEqual(200);
  });

  it("datatable: no se puede filtrar ni ordenar por la clave (adivinaría el hash)", async () => {
    const probe = await api().post(`${V1}/users/datatable`).set("Authorization", s.shift.auth).send({ page: 1, limit: 10, filters: { password: "$2a$10$" } });
    expect(probe.status).toBe(200);
    expect(probe.body.data.total).toBe(6);
    const sorted = await api().post(`${V1}/users/datatable`).set("Authorization", s.shift.auth).send({ page: 1, limit: 10, filters: {}, sort: { key: "password", direction: "asc" } });
    expect(sorted.status).toBe(200);
    expect(JSON.stringify(sorted.body)).not.toMatch(/\$2[aby]\$/);
  });

  it.each(["guard1", "maint", "resident"] as const)("%s no consulta usuarios → 403", async (key) => {
    expectFail(await api().get(`${V1}/users`).set("Authorization", s[key].auth), 403);
    expectFail(await api().post(`${V1}/users/datatable`).set("Authorization", s[key].auth).send({}), 403);
  });
});

describe("edición de perfil", () => {
  it("el propio usuario cambia su nombre pero NO su rol ni su horario", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    const res = await api().put(`${V1}/users/${s.guard1.id}`).set("Authorization", s.guard1.auth).send({ name: "Gabi", roleId: admin.id, role: "ADMIN", scheduleId: null });
    expectOk(res);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: s.guard1.id }, include: { role: true } });
    expect(row.name).toBe("Gabi");
    expect(row.role.name).toBe("GUARD");
    expect(row.scheduleId).toBe(flows.staff.scheduleId);
  });

  it("ADMIN cambia el rol y el horario de otro usuario", async () => {
    const maint = await prisma.role.findUniqueOrThrow({ where: { name: "MAINT" } });
    expectOk(await api().put(`${V1}/users/${s.guard2.id}`).set("Authorization", s.admin.auth).send({ roleId: maint.id, shiftStart: "08:00", shiftEnd: "16:00" }));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: s.guard2.id } });
    expect(row.roleId).toBe(maint.id);
    expect(row.shiftStart).toBe("08:00");
  });

  it("no permite usar el nombre de usuario de otra cuenta, pero sí conservar el propio", async () => {
    expectFail(await api().put(`${V1}/users/${s.guard1.id}`).set("Authorization", s.guard1.auth).send({ username: "flow_guard2" }), 400);
    expectOk(await api().put(`${V1}/users/${s.guard1.id}`).set("Authorization", s.guard1.auth).send({ username: "flow_guard1" }));
  });

  it("ningún usuario edita a otro sin ser administrador → 403", async () => {
    expectFail(await api().put(`${V1}/users/${s.guard2.id}`).set("Authorization", s.guard1.auth).send({ name: "Hack" }), 403);
    expectFail(await api().put(`${V1}/users/${s.admin.id}`).set("Authorization", s.shift.auth).send({ name: "Hack" }), 403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.guard2.id } })).name).not.toBe("Hack");
  });

  it("un campo password en el perfil no cambia la contraseña (solo los endpoints de contraseña)", async () => {
    await api().put(`${V1}/users/${s.guard1.id}`).set("Authorization", s.guard1.auth).send({ name: "Gabi", password: "intento-directo" });
    expect((await loginReal("flow_guard1", FLOW_PASSWORD)).status).toBe(200);
  });

  it("validación: id inválido, nombre vacío, usuario corto → 400; id inexistente → 404", async () => {
    expectFail(await api().put(`${V1}/users/abc`).set("Authorization", s.admin.auth).send({ name: "X" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${V1}/users/${s.guard1.id}`).set("Authorization", s.admin.auth).send({ name: "" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${V1}/users/${s.guard1.id}`).set("Authorization", s.admin.auth).send({ username: "ab" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${V1}/users/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "X" }), 404);
  });
});

describe("contraseñas", () => {
  it("cambio propio: exige la actual, guarda hash y la nueva funciona", async () => {
    expectFail(await api().put(`${V1}/users/${s.guard1.id}/password`).set("Authorization", s.guard1.auth).send({ oldPassword: "mal", newPassword: "nueva-clave-1" }), 400);
    expectOk(await api().put(`${V1}/users/${s.guard1.id}/password`).set("Authorization", s.guard1.auth).send({ oldPassword: FLOW_PASSWORD, newPassword: "nueva-clave-1" }));
    expect((await loginReal("flow_guard1", "nueva-clave-1")).status).toBe(200);
    expect((await loginReal("flow_guard1", FLOW_PASSWORD)).status).toBe(401);
  });

  it("validación: nueva contraseña corta o sin la actual → 400", async () => {
    expectFail(await api().put(`${V1}/users/${s.guard1.id}/password`).set("Authorization", s.guard1.auth).send({ oldPassword: FLOW_PASSWORD, newPassword: "123" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${V1}/users/${s.guard1.id}/password`).set("Authorization", s.guard1.auth).send({ newPassword: "nueva-clave-1" }), 400, "VALIDATION_ERROR");
  });

  it("nadie cambia la contraseña de otro (salvo ADMIN) → 403", async () => {
    expectFail(await api().put(`${V1}/users/${s.guard2.id}/password`).set("Authorization", s.guard1.auth).send({ oldPassword: FLOW_PASSWORD, newPassword: "nueva-clave-1" }), 403);
  });

  it("usuario inexistente → 404", async () => {
    expectFail(await api().put(`${V1}/users/${MISSING_ID}/password`).set("Authorization", s.admin.auth).send({ oldPassword: "x", newPassword: "nueva-clave-1" }), 404);
  });

  it("ADMIN restablece la contraseña de otro; la anterior deja de servir", async () => {
    expectOk(await api().put(`${V1}/users/${s.guard1.id}/reset-password`).set("Authorization", s.admin.auth).send({ newPassword: "restablecida-1" }));
    expect((await loginReal("flow_guard1", "restablecida-1")).status).toBe(200);
    expect((await loginReal("flow_guard1", FLOW_PASSWORD)).status).toBe(401);
  });

  it("restablecer: validación, rol y usuario inexistente", async () => {
    expectFail(await api().put(`${V1}/users/${s.guard1.id}/reset-password`).set("Authorization", s.admin.auth).send({ newPassword: "123" }), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${V1}/users/${s.guard1.id}/reset-password`).set("Authorization", s.shift.auth).send({ newPassword: "restablecida-1" }), 403);
    expectFail(await api().put(`${V1}/users/${MISSING_ID}/reset-password`).set("Authorization", s.admin.auth).send({ newPassword: "restablecida-1" }), 404);
  });
});

describe("baja de usuarios", () => {
  it("camino feliz: baja lógica, ya no aparece ni inicia sesión y libera su nombre de usuario", async () => {
    expectOk(await api().delete(`${V1}/users/${s.guard2.id}`).set("Authorization", s.admin.auth));
    const row = await prisma.user.findUniqueOrThrow({ where: { id: s.guard2.id } });
    expect(row).toMatchObject({ softDelete: true, active: false });
    expect(row.username).not.toBe("flow_guard2");
    const list = expectOk(await api().get(`${V1}/users`).set("Authorization", s.admin.auth));
    expect(list.map((u: any) => u.id)).not.toContain(s.guard2.id);
    expectFail(await loginReal("flow_guard2"), 401);
    // El nombre quedó libre para una cuenta nueva.
    expectOk(await api().post(`${V1}/users`).set("Authorization", s.admin.auth).send(newUser({ username: "flow_guard2" })), 201);
  });

  it("id inexistente → 404 y roles sin permiso → 403", async () => {
    expectFail(await api().delete(`${V1}/users/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().delete(`${V1}/users/${s.guard2.id}`).set("Authorization", s.shift.auth), 403);
    expectFail(await api().delete(`${V1}/users/${s.guard2.id}`).set("Authorization", s.resident.auth), 403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.guard2.id } })).softDelete).toBe(false);
  });

  it("id no numérico no provoca 500", async () => {
    const res = await api().delete(`${V1}/users/abc`).set("Authorization", s.admin.auth);
    expect(res.status).toBeLessThan(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("dar de baja la cuenta de la residente conserva su lugar en el hogar pero le quita el acceso a la APP", async () => {
    expectOk(await api().delete(`${V1}/users/${s.resident.id}`).set("Authorization", s.admin.auth));
    const link = await prisma.resident.findFirstOrThrow({ where: { propertyId: flows.properties.houseId } });
    expect(link).toMatchObject({ status: "ACTIVE", hasAppAccess: false });
  });
});
