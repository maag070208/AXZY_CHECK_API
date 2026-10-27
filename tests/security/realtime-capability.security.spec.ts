/**
 * S-18: el residente no recibe permiso sobre los canales internos de tiempo real
 * (chat del equipo, alertas de turno, dashboard). Solo el personal los escucha.
 */
import { ABLY_CHANNELS, realtimeCapabilityFor } from "@src/core/config/ably";

const INTERNAL = Object.values(ABLY_CHANNELS);

describe("capacidades de tiempo real por rol", () => {
  it.each(["ADMIN", "SHIFT", "GUARD", "MAINT"])("%s escucha los canales internos", (role) => {
    const capability = realtimeCapabilityFor(role, 1);
    for (const channel of INTERNAL) expect(capability[channel]).toEqual(["subscribe"]);
  });

  it("RESDN no recibe ningún canal interno, solo su canal personal", () => {
    const capability = realtimeCapabilityFor("RESDN", 42);
    for (const channel of INTERNAL) expect(capability[channel]).toBeUndefined();
    expect(Object.keys(capability)).toEqual(["user:42"]);
    expect(capability["user:42"]).toEqual(["subscribe"]);
  });

  it("un rol desconocido o ausente se trata como no-personal (cierra por defecto)", () => {
    for (const role of [undefined, "", "OTRO"]) {
      const capability = realtimeCapabilityFor(role, 7);
      for (const channel of INTERNAL) expect(capability[channel]).toBeUndefined();
    }
  });
});
