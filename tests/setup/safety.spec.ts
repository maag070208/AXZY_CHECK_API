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
