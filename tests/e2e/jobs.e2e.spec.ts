/**
 * Trabajos programados y arranque del servidor: se registran con las horas y zona configuradas,
 * una sola réplica emite cada alerta y un fallo nunca tumba el proceso.
 */
import cron from "node-cron";
import { clearSettingsCache } from "@src/core/settings/app-settings.service";
import { bootFlows, disconnectDatabase, prisma } from "./support";

jest.mock("node-cron", () => ({ __esModule: true, default: { schedule: jest.fn() } }));
const publishToChannel = jest.fn();
jest.mock("@src/core/config/ably", () => ({
  ...jest.requireActual("@src/core/config/ably"),
  publishToChannel: (...args: unknown[]) => publishToChannel(...args),
}));
const processOutbox = jest.fn();
jest.mock("@src/core/outbox/outbox", () => ({ ...jest.requireActual("@src/core/outbox/outbox"), processOutbox: () => processOutbox() }));

const schedule = cron.schedule as unknown as jest.Mock;

beforeEach(async () => {
  await bootFlows();
  clearSettingsCache();
  schedule.mockReset();
  publishToChannel.mockReset().mockResolvedValue(undefined);
  processOutbox.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(disconnectDatabase);

describe("alertas de entrega de turno", () => {
  it("registra dos trabajos con la hora y la zona configuradas y publica cada alerta", async () => {
    await prisma.appSetting.upsert({ where: { key: "app.timezone" }, update: { value: "America/Tijuana" }, create: { key: "app.timezone", value: "America/Tijuana", valueType: "string", group: "general" } });
    await prisma.appSetting.create({ data: { key: "SHIFT_ALERT_MORNING_TIME", value: "06:45", valueType: "string", group: "turnos" } });
    clearSettingsCache();
    const { registerShiftAlertCron } = await import("@src/core/jobs/shift-alert.cron");
    await registerShiftAlertCron();

    expect(schedule.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ["45 6 * * *", { timezone: "America/Tijuana" }],
      ["0 19 * * *", { timezone: "America/Tijuana" }],
    ]);
    await schedule.mock.calls[0][1]();
    await schedule.mock.calls[1][1]();
    expect(publishToChannel).toHaveBeenCalledTimes(2);
    expect(publishToChannel.mock.calls[0][2]).toMatchObject({ shiftType: "NOCTURNO", message: expect.stringContaining("nocturno") });
    expect(publishToChannel.mock.calls[1][2]).toMatchObject({ shiftType: "MATUTINO", message: expect.stringContaining("matutino") });
  });

  it("si publicar falla no lanza; si no se pueden leer los ajustes, el registro tampoco tumba el arranque", async () => {
    publishToChannel.mockRejectedValue(new Error("Ably caído"));
    const { registerShiftAlertCron } = await import("@src/core/jobs/shift-alert.cron");
    await registerShiftAlertCron();
    await expect(schedule.mock.calls[0][1]()).resolves.toBeUndefined();

    schedule.mockReset();
    await prisma.appSetting.upsert({ where: { key: "SHIFT_ALERT_EVENING_TIME" }, update: { value: "x" }, create: { key: "SHIFT_ALERT_EVENING_TIME", value: "x", valueType: "string", group: "turnos" } });
    clearSettingsCache();
    jest.spyOn(prisma.appSetting, "findUnique").mockRejectedValue(new Error("BD caída"));
    await expect(registerShiftAlertCron()).resolves.toBeUndefined();
  });
});

describe("procesador del outbox", () => {
  it("corre cada 30 s y un fallo se registra sin detener el trabajo", async () => {
    const { registerOutboxWorker } = await import("@src/core/jobs/outbox.cron");
    registerOutboxWorker();
    expect(schedule.mock.calls[0][0]).toBe("*/30 * * * * *");
    await schedule.mock.calls[0][1]();
    expect(processOutbox).toHaveBeenCalledTimes(1);
    processOutbox.mockRejectedValueOnce(new Error("falló"));
    await expect(schedule.mock.calls[0][1]()).resolves.toBeUndefined();
  });
});

describe("arranque del servidor", () => {
  it("escucha en el puerto configurado, registra los trabajos y se apaga ordenadamente con SIGTERM", async () => {
    const close = jest.fn((cb: () => void) => cb());
    const listen = jest.fn((_port: number, _host: string, cb: () => void) => {
      cb();
      return { close, timeout: 0 };
    });
    jest.doMock("@src/app", () => ({ app: { listen } }));
    const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    // El apagado arma un temporizador de 20 s que forzaría process.exit(1): se neutraliza para no matar la suite.
    const realSetTimeout = global.setTimeout;
    const watchdog = jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
      ms === 20000 ? ({ unref: () => undefined } as unknown as NodeJS.Timeout) : realSetTimeout(fn, ms, ...args)) as never);
    const before = process.listenerCount("SIGTERM");
    process.env.PORT = "4555";
    await jest.isolateModulesAsync(async () => {
      await import("@src/index");
    });
    expect(listen).toHaveBeenCalledWith(4555, "0.0.0.0", expect.any(Function));
    expect(schedule).toHaveBeenCalled();
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);

    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    expect(close).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
    expect(watchdog.mock.calls.some((c) => c[1] === 20000)).toBe(true);
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    delete process.env.PORT;
    jest.dontMock("@src/app");
  });
});
