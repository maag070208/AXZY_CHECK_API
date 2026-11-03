/**
 * Multicliente, fase 1: resolución del alcance (cliente) a partir de la sesión y de X-Client-Id.
 * Reglas en core/scope/client-scope.ts.
 */
import { resolveClientScope, scopeByClient, ScopeSource } from "@src/core/scope/client-scope";
import { AppError } from "@src/core/errors/app-error";

const source = (overrides: Partial<ScopeSource>): ScopeSource => ({
  role: "GUARD",
  organizationId: 1,
  assignedClientId: null,
  propertyClientId: null,
  userClientId: null,
  organizationClientIds: [10, 20],
  ...overrides,
});

describe("resolveClientScope", () => {
  it.each(["GUARD", "SHIFT"])("%s: el cliente es el de su asignación activa", (role) => {
    expect(resolveClientScope(source({ role, assignedClientId: 10 }), undefined)).toEqual({
      ok: true,
      scope: { organizationId: 1, clientId: 10 },
    });
  });

  it("guardia sin asignación: sin cliente (aunque la organización tenga uno solo)", () => {
    expect(resolveClientScope(source({ organizationClientIds: [10] }), undefined)).toEqual({
      ok: true,
      scope: { organizationId: 1, clientId: null },
    });
  });

  it("guardia: X-Client-Id de otro cliente es 403; el suyo se acepta", () => {
    expect(resolveClientScope(source({ assignedClientId: 10 }), "20")).toMatchObject({ ok: false, status: 403 });
    expect(resolveClientScope(source({ assignedClientId: 10 }), "10")).toMatchObject({ ok: true, scope: { clientId: 10 } });
  });

  it("CLIENT: el cliente es el suyo, fijo; X-Client-Id distinto es 403 y el propio se acepta", () => {
    const role = "CLIENT";
    expect(resolveClientScope(source({ role, userClientId: 20 }), undefined)).toEqual({
      ok: true,
      scope: { organizationId: 1, clientId: 20 },
    });
    expect(resolveClientScope(source({ role, userClientId: 20 }), "10")).toMatchObject({ ok: false, status: 403 });
    expect(resolveClientScope(source({ role, userClientId: 20 }), "20")).toMatchObject({ ok: true, scope: { clientId: 20 } });
  });

  it("CLIENT sin cliente asignado: sin alcance de cliente", () => {
    expect(resolveClientScope(source({ role: "CLIENT", userClientId: null }), undefined)).toEqual({
      ok: true,
      scope: { organizationId: 1, clientId: null },
    });
  });

  it("guardia sin asignación no puede elegir cliente con X-Client-Id", () => {
    expect(resolveClientScope(source({}), "10")).toMatchObject({ ok: false, status: 403 });
  });

  it("residente: el cliente de su propiedad; otro X-Client-Id es 403", () => {
    expect(resolveClientScope(source({ role: "RESDN", propertyClientId: 20 }), undefined)).toMatchObject({ ok: true, scope: { clientId: 20 } });
    expect(resolveClientScope(source({ role: "RESDN", propertyClientId: 20 }), "10")).toMatchObject({ ok: false, status: 403 });
  });

  it.each(["ADMIN", "MAINT"])("%s: elige con X-Client-Id un cliente de su organización", (role) => {
    expect(resolveClientScope(source({ role }), "20")).toEqual({ ok: true, scope: { organizationId: 1, clientId: 20 } });
  });

  it("ADMIN: X-Client-Id fuera de su organización es 403", () => {
    expect(resolveClientScope(source({ role: "ADMIN" }), "30")).toMatchObject({ ok: false, status: 403 });
  });

  it("ADMIN sin X-Client-Id: el único cliente (producto 1) o ninguno si hay varios", () => {
    expect(resolveClientScope(source({ role: "ADMIN", organizationClientIds: [10] }), undefined)).toMatchObject({ ok: true, scope: { clientId: 10 } });
    expect(resolveClientScope(source({ role: "ADMIN" }), undefined)).toMatchObject({ ok: true, scope: { clientId: null } });
    expect(resolveClientScope(source({ role: "ADMIN" }), "")).toMatchObject({ ok: true, scope: { clientId: null } });
  });

  it("ADMIN sin organización: sin cliente y no puede elegir", () => {
    const none = source({ role: "ADMIN", organizationId: null, organizationClientIds: [] });
    expect(resolveClientScope(none, undefined)).toEqual({ ok: true, scope: { organizationId: null, clientId: null } });
    expect(resolveClientScope(none, "10")).toMatchObject({ ok: false, status: 403 });
  });

  it("rol desconocido: sin cliente", () => {
    expect(resolveClientScope(source({ role: "OTRO", assignedClientId: 10 }), undefined)).toMatchObject({ ok: true, scope: { clientId: null } });
  });

  it.each(["abc", "0", "-1", "1.5", "10 ", "99999999999"])("X-Client-Id inválido (%p) es 400", (header) => {
    expect(resolveClientScope(source({ role: "ADMIN" }), header)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("scopeByClient", () => {
  it("devuelve el filtro { clientId }", () => {
    expect(scopeByClient({ organizationId: 1, clientId: 10 })).toEqual({ clientId: 10 });
  });

  it.each([undefined, { organizationId: 1, clientId: null }, { organizationId: null, clientId: null }])(
    "sin cliente en el alcance lanza 403 (%p)",
    (scope) => {
      expect(() => scopeByClient(scope)).toThrow(AppError);
      try {
        scopeByClient(scope);
      } catch (error) {
        expect(error).toMatchObject({ code: "CLIENT_SCOPE_REQUIRED", status: 403 });
      }
    },
  );
});
