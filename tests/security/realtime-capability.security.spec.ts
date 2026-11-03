/**
 * S-18 + fase 5: el residente no recibe permiso sobre los canales internos de tiempo real y el chat del
 * equipo dejó de ser un canal global: cada cliente tiene el suyo (`chat:team:<clientId>`) y solo se emiten
 * las capacidades de los clientes que el alcance permite escuchar.
 */
import { ABLY_CHANNELS, chatTeamChannel, realtimeCapabilityFor } from "@src/core/config/ably";

const STAFF_CHANNELS = [ABLY_CHANNELS.SHIFT_ALERTS, ABLY_CHANNELS.DASHBOARD_LIVE];

describe("capacidades de tiempo real por rol y cliente", () => {
  it("el canal de chat es por cliente y el canal global ya no existe", () => {
    expect(chatTeamChannel(7)).toBe("chat:team:7");
    expect(chatTeamChannel(42)).toBe("chat:team:42");
    expect(Object.values(ABLY_CHANNELS)).not.toContain("chat:team");
  });

  it.each(["ADMIN", "SHIFT", "GUARD", "MAINT"])("%s escucha los canales internos y el chat de sus clientes", (role) => {
    const capability = realtimeCapabilityFor(role, 1, [3, 5]);
    for (const channel of STAFF_CHANNELS) expect(capability[channel]).toEqual(["subscribe"]);
    expect(capability["chat:team:3"]).toEqual(["subscribe"]);
    expect(capability["chat:team:5"]).toEqual(["subscribe"]);
    // Nunca el canal global ni el de un cliente no permitido.
    expect(capability["chat:team"]).toBeUndefined();
    expect(capability["chat:team:4"]).toBeUndefined();
  });

  it("el personal sin clientes en el alcance no recibe ningún canal de chat", () => {
    const capability = realtimeCapabilityFor("GUARD", 1);
    for (const channel of STAFF_CHANNELS) expect(capability[channel]).toEqual(["subscribe"]);
    expect(Object.keys(capability).every((channel) => !channel.startsWith("chat:team"))).toBe(true);
    expect(Object.keys(capability)).toEqual(STAFF_CHANNELS);
  });

  it("los clientes repetidos no duplican canales", () => {
    const capability = realtimeCapabilityFor("SHIFT", 9, [2, 2, 3]);
    expect(capability["chat:team:2"]).toEqual(["subscribe"]);
    expect(capability["chat:team:3"]).toEqual(["subscribe"]);
    expect(Object.keys(capability).filter((channel) => channel.startsWith("chat:team"))).toEqual(["chat:team:2", "chat:team:3"]);
  });

  it("RESDN no recibe ningún canal interno, solo su canal personal (aunque tenga clientes)", () => {
    const capability = realtimeCapabilityFor("RESDN", 42, [3, 5]);
    for (const channel of STAFF_CHANNELS) expect(capability[channel]).toBeUndefined();
    expect(capability["chat:team:3"]).toBeUndefined();
    expect(capability["chat:team"]).toBeUndefined();
    expect(Object.keys(capability)).toEqual(["user:42"]);
    expect(capability["user:42"]).toEqual(["subscribe"]);
  });

  it("un rol desconocido o ausente se trata como no-personal (cierra por defecto)", () => {
    for (const role of [undefined, "", "OTRO"]) {
      const capability = realtimeCapabilityFor(role, 7, [3]);
      for (const channel of STAFF_CHANNELS) expect(capability[channel]).toBeUndefined();
      expect(capability["chat:team:3"]).toBeUndefined();
      expect(Object.keys(capability)).toEqual(["user:7"]);
    }
  });
});
