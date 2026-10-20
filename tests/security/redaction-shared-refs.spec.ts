/**
 * La redacción de secretos no debe perder datos al compartir referencias (un mismo objeto
 * en dos sitios de la respuesta). Solo los ciclos reales se cortan.
 */
import { redactSecrets } from "@src/core/middlewares/redact-secrets.middleware";

describe("redacción de respuestas", () => {
  it("un mismo objeto usado en dos lugares sale completo en ambos", () => {
    const shared = { id: 1, name: "Vacía" };
    const out = redactSecrets({ current: shared, history: [shared] });
    expect(out.current).toEqual({ id: 1, name: "Vacía" });
    expect(out.history).toEqual([{ id: 1, name: "Vacía" }]);
  });

  it("un ciclo real se corta sin recursión infinita y sin tocar el resto", () => {
    const node: any = { id: 2 };
    node.self = node;
    const out = redactSecrets(node);
    expect(out.id).toBe(2);
    expect(out.self).toBeUndefined();
  });

  it("sigue quitando claves secretas, también dentro de objetos compartidos", () => {
    const shared = { id: 3, password: "hash" };
    const out = redactSecrets({ a: shared, b: shared });
    expect(out.a).toEqual({ id: 3 });
    expect(out.b).toEqual({ id: 3 });
  });
});
