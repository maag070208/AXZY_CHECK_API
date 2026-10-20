/**
 * [E1] Infraestructura: caché de ajustes (E-09), candado del cron (E-13),
 * límites del pool (E-14) y endpoints de salud (T-E1-10).
 */
import request from "supertest";
import { app } from "@src/app";
import { getSysConfig, clearSysConfigCache } from "@src/modules/shift-handover/shift-handover.service";
import { withAdvisoryLock } from "@src/core/utils/advisory-lock";
import { buildDatabaseUrl } from "@src/core/config/database";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";

beforeEach(async () => {
  await resetDatabase();
  clearSysConfigCache();
});

afterAll(async () => {
  clearSysConfigCache();
  await disconnectDatabase();
});

describe("caché de SysConfig (E-09)", () => {
  it("no vuelve a leer la base dentro del TTL, y se invalida al limpiar", async () => {
    await prisma.sysConfig.upsert({
      where: { key: "DASHBOARD_STALE_MINUTES" },
      update: { value: "20" },
      create: { key: "DASHBOARD_STALE_MINUTES", value: "20" },
    });
    expect(await getSysConfig("DASHBOARD_STALE_MINUTES", "0")).toBe("20");

    await prisma.sysConfig.update({ where: { key: "DASHBOARD_STALE_MINUTES" }, data: { value: "45" } });
    // Dentro del TTL: sigue el valor cacheado.
    expect(await getSysConfig("DASHBOARD_STALE_MINUTES", "0")).toBe("20");

    clearSysConfigCache();
    expect(await getSysConfig("DASHBOARD_STALE_MINUTES", "0")).toBe("45");
  });

  it("usa el valor por defecto si la clave no existe", async () => {
    expect(await getSysConfig("NO_EXISTE", "fallback")).toBe("fallback");
  });
});

describe("candado del cron (E-13)", () => {
  it("una instancia que no obtiene el candado no ejecuta el trabajo", async () => {
    const key = 710999;
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = prisma.$transaction(async (tx) => {
      // $executeRaw: pg_advisory_xact_lock devuelve void y $queryRaw no lo puede leer.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
      await released;
    });
    await new Promise((r) => setTimeout(r, 200));

    const job = jest.fn(async () => {});
    expect(await withAdvisoryLock(key, job)).toBe(false);
    expect(job).not.toHaveBeenCalled();

    release();
    await holder;
    expect(await withAdvisoryLock(key, job)).toBe(true);
    expect(job).toHaveBeenCalledTimes(1);
  });
});

describe("límites del pool (E-14)", () => {
  it("agrega connection_limit y pool_timeout desde el entorno", () => {
    const url = buildDatabaseUrl("postgresql://u:p@localhost:5432/db_test", {
      PRISMA_CONNECTION_LIMIT: "5",
      PRISMA_POOL_TIMEOUT: "20",
    } as NodeJS.ProcessEnv)!;
    expect(url).toContain("connection_limit=5");
    expect(url).toContain("pool_timeout=20");
  });

  it("no cambia la URL si no hay variables de pool", () => {
    const original = "postgresql://u:p@localhost:5432/db_test";
    expect(buildDatabaseUrl(original, {} as NodeJS.ProcessEnv)).toBe(new URL(original).toString());
  });

  it("respeta un límite ya presente en la URL", () => {
    const url = buildDatabaseUrl("postgresql://u:p@localhost:5432/db_test?connection_limit=9", {
      PRISMA_CONNECTION_LIMIT: "5",
    } as NodeJS.ProcessEnv)!;
    expect(url).toContain("connection_limit=9");
    expect(url).not.toContain("connection_limit=5");
  });
});

describe("salud (T-E1-10)", () => {
  it("/health responde 200 sin token", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("/ready responde 200 cuando la base responde, sin token", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});
