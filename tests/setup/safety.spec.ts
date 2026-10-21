import { assertSafeTestDatabase } from "./safety";

describe("guardia de base de prueba", () => {
  it("acepta una base local terminada en _test", () => {
    expect(() => assertSafeTestDatabase("postgresql://u:p@localhost:55433/checkapp_test")).not.toThrow();
  });

  it("rechaza una base que no termina en _test (p. ej. la de operación)", () => {
    expect(() => assertSafeTestDatabase("postgresql://u:p@localhost:5432/checkapp")).toThrow(/_test/);
  });

  it("rechaza un host remoto aunque el nombre termine en _test", () => {
    expect(() => assertSafeTestDatabase("postgresql://u:p@iriguchi.proxy.rlwy.net:21042/railway_test")).toThrow(/no es local/);
  });

  it("rechaza una URL inválida", () => {
    expect(() => assertSafeTestDatabase("no-es-url")).toThrow(/no es una URL válida/);
  });
});

describe("servicios externos apagados en las pruebas", () => {
  it("las claves reales del .env no llegan a las pruebas aunque la app cargue dotenv", async () => {
    await import("@src/core/config/config");
    for (const key of ["ABLY_KEY", "RESEND_API_KEY", "AWS_BUCKET_NAME", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GOOGLE_MAPS_API_KEY"]) {
      expect(process.env[key]).toBe("");
    }
  });
});
