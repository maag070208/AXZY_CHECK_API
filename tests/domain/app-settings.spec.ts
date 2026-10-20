/**
 * [T-F0-06] Ajustes del cliente (AppSetting): lectura con caché, validación por
 * tipo, secretos fuera de la API y administración solo para ADMIN.
 */
import request from "supertest";
import { app } from "@src/app";
import { getSetting, setSetting, clearSettingsCache } from "@src/core/settings/app-settings.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const BASE = "/api/v1/settings";

beforeEach(async () => {
  await resetDatabase();
  clearSettingsCache();
});

afterAll(async () => {
  await disconnectDatabase();
});

const seedSetting = (data: { key: string; valueType?: string; value: string; group?: string; isSecret?: boolean }) =>
  prisma.appSetting.create({
    data: { valueType: "string", group: "general", ...data },
  });

const auth = async (role: "ADMIN" | "GUARD" | "SHIFT") => `Bearer ${tokenFor(await buildUser(role))}`;

describe("lectura (getSetting)", () => {
  it("devuelve el valor guardado o el valor por defecto si no existe", async () => {
    await seedSetting({ key: "DASHBOARD_STALE_MINUTES", valueType: "int", value: "20" });
    expect(await getSetting("DASHBOARD_STALE_MINUTES", "0")).toBe("20");
    expect(await getSetting("NO_EXISTE", "fallback")).toBe("fallback");
  });

  it("cachea dentro del TTL y se invalida al cambiar el valor", async () => {
    await seedSetting({ key: "DASHBOARD_STALE_MINUTES", valueType: "int", value: "20" });
    expect(await getSetting("DASHBOARD_STALE_MINUTES", "0")).toBe("20");

    await prisma.appSetting.update({ where: { key: "DASHBOARD_STALE_MINUTES" }, data: { value: "45" } });
    // Dentro del TTL: sigue el valor cacheado.
    expect(await getSetting("DASHBOARD_STALE_MINUTES", "0")).toBe("20");

    await setSetting("DASHBOARD_STALE_MINUTES", "30");
    expect(await getSetting("DASHBOARD_STALE_MINUTES", "0")).toBe("30");
  });
});

describe("escritura (setSetting)", () => {
  it("rechaza un entero inválido en un ajuste tipo int", async () => {
    await seedSetting({ key: "DASHBOARD_STALE_MINUTES", valueType: "int", value: "20" });
    await expect(setSetting("DASHBOARD_STALE_MINUTES", "veinte")).rejects.toMatchObject({ code: "SETTING_INVALID_VALUE", status: 400 });
  });

  it("rechaza un booleano inválido en un ajuste tipo bool", async () => {
    await seedSetting({ key: "MAINTENANCE_MODE", valueType: "bool", value: "false" });
    await expect(setSetting("MAINTENANCE_MODE", "si")).rejects.toMatchObject({ code: "SETTING_INVALID_VALUE" });
  });

  it("no crea ajustes nuevos: una clave desconocida responde 404", async () => {
    await expect(setSetting("CLAVE_NUEVA", "x")).rejects.toMatchObject({ code: "SETTING_NOT_FOUND", status: 404 });
  });
});

describe("API /settings", () => {
  it("ADMIN lista los ajustes no secretos y nunca ve un secreto", async () => {
    await seedSetting({ key: "APP_VERSION", value: "1.0.0", group: "general" });
    await seedSetting({ key: "API_TOKEN_EXTERNO", value: "no-debe-salir", isSecret: true });

    const res = await request(app).get(BASE).set("Authorization", await auth("ADMIN"));
    expect(res.status).toBe(200);
    const keys = res.body.data.map((s: any) => s.key);
    expect(keys).toContain("APP_VERSION");
    expect(keys).not.toContain("API_TOKEN_EXTERNO");
    expect(JSON.stringify(res.body)).not.toContain("no-debe-salir");
  });

  it("no ADMIN no puede listar ni cambiar ajustes", async () => {
    await seedSetting({ key: "APP_VERSION", value: "1.0.0" });
    const token = await auth("SHIFT");
    expect((await request(app).get(BASE).set("Authorization", token)).status).toBe(403);
    expect((await request(app).put(`${BASE}/APP_VERSION`).set("Authorization", token).send({ value: "9" })).status).toBe(403);
  });

  it("ADMIN actualiza un ajuste y el cambio se refleja al leer", async () => {
    await seedSetting({ key: "DASHBOARD_STALE_MINUTES", valueType: "int", value: "20" });
    const res = await request(app)
      .put(`${BASE}/DASHBOARD_STALE_MINUTES`)
      .set("Authorization", await auth("ADMIN"))
      .send({ value: "45" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ key: "DASHBOARD_STALE_MINUTES", value: "45", valueType: "int" });
    expect(await getSetting("DASHBOARD_STALE_MINUTES", "0")).toBe("45");
  });

  it("valor inválido para el tipo responde 400 con código", async () => {
    await seedSetting({ key: "MAINTENANCE_MODE", valueType: "bool", value: "false" });
    const res = await request(app)
      .put(`${BASE}/MAINTENANCE_MODE`)
      .set("Authorization", await auth("ADMIN"))
      .send({ value: "quizá" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SETTING_INVALID_VALUE");
  });

  it("clave con caracteres inválidos responde 400 de validación", async () => {
    const res = await request(app)
      .put(`${BASE}/clave%20mala`)
      .set("Authorization", await auth("ADMIN"))
      .send({ value: "x" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("sin token no hay acceso (guard global)", async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
  });
});
