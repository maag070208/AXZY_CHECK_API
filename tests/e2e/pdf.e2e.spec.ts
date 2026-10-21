/**
 * Reportes PDF con evidencia: descarga de imágenes (sin consultar la red interna), mapas, paginación
 * con muchos registros y textos largos o con caracteres especiales.
 */
import axios from "axios";
import { isSafeRemoteImage } from "@src/modules/reports/pdf-report.renderer";
import { api, allSessions, bootFlows, disconnectDatabase, expectOk, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

// PNG de 1×1 píxel.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterEach(() => jest.restoreAllMocks());
afterAll(disconnectDatabase);

const binary = (req: ReturnType<ReturnType<typeof api>["get"]>) =>
  req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  });

const q = "startDate=2020-01-01T00:00:00.000Z&endDate=2999-12-31T23:59:59.000Z";

describe("isSafeRemoteImage", () => {
  it.each([
    "https://bucket.s3.us-east-2.amazonaws.com/a.jpg", "http://example.test/a.png", "https://8.8.8.8/x.jpg",
  ])("acepta %s", (url) => expect(isSafeRemoteImage(url)).toBe(true));

  it.each([
    "http://localhost:3000/x", "http://127.0.0.1/x", "http://10.0.0.5/x", "http://192.168.1.10/x", "http://172.20.0.1/x",
    "http://169.254.169.254/latest/meta-data/", "http://0.0.0.0/x", "http://[::1]/x", "http://servicio.internal/x", "http://nas.local/x",
    "file:///etc/passwd", "ftp://example.test/x", "javascript:alert(1)", "no es una url", "",
  ])("rechaza %s", (url) => expect(isSafeRemoteImage(url)).toBe(false));
});

describe("PDF con evidencia", () => {
  it("descarga las imágenes públicas, ignora los videos y las direcciones internas, y pagina muchos registros", async () => {
    const get = jest.spyOn(axios, "get").mockResolvedValue({ data: PNG });
    const category = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "SEGURIDAD" } });
    await prisma.incident.createMany({
      data: Array.from({ length: 14 }, (_, i) => ({
        guardId: s.guard1.id, title: `Incidencia ${i} con ñ, acentos áéíóú y <etiquetas> & símbolos`, categoryId: category.id,
        description: `Descripción larga ${"muy larga ".repeat(120)}`, latitude: 32.5 + i / 1000, longitude: -117 - i / 1000,
        status: i % 2 ? "ATTENDED" : "PENDING", resolvedAt: i % 2 ? new Date() : null, resolvedById: i % 2 ? s.shift.id : null,
        media: [
          { type: "IMAGE", url: `https://cdn.example.test/${i}/a.png` },
          { type: "IMAGE", url: `https://cdn.example.test/${i}/b.png` },
          { type: "IMAGE", url: "http://169.254.169.254/latest/meta-data/" },
          { type: "VIDEO", url: `https://cdn.example.test/${i}/v.mp4` },
        ],
      })),
    });
    const res = await binary(api().get(`${V1}/reports/incidents/pdf?${q}&includeImages=true&includeLocation=true`).set("Authorization", s.admin.auth));
    expect(res.status).toBe(200);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(20_000);
    const requested = get.mock.calls.map((c) => String(c[0]));
    expect(requested.some((u) => u.includes("169.254"))).toBe(false);
    expect(requested.some((u) => u.endsWith("v.mp4"))).toBe(false);
    expect(requested.some((u) => u.endsWith("a.png"))).toBe(true);
  });

  it("si una imagen no se puede descargar, el PDF se genera igual", async () => {
    jest.spyOn(axios, "get").mockRejectedValue(new Error("timeout"));
    await prisma.incident.update({ where: { id: flows.reports.pendingIncidentId }, data: { media: [{ type: "IMAGE", url: "https://cdn.example.test/x.png" }] } });
    const res = await binary(api().get(`${V1}/reports/incidents/pdf?${q}&ids=${flows.reports.pendingIncidentId}`).set("Authorization", s.shift.auth));
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("con clave de mapas configurada pide el mapa de cada punto", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "clave-de-prueba";
    const get = jest.spyOn(axios, "get").mockResolvedValue({ data: PNG });
    try {
      await prisma.incident.update({ where: { id: flows.reports.pendingIncidentId }, data: { latitude: 32.5, longitude: -117 } });
      const res = await binary(api().get(`${V1}/reports/incidents/pdf?${q}&includeLocation=true&includeImages=false`).set("Authorization", s.admin.auth));
      expect(res.status).toBe(200);
      expect(get.mock.calls.some((c) => String(c[0]).startsWith("https://maps.googleapis.com/maps/api/staticmap"))).toBe(true);
    } finally {
      process.env.GOOGLE_MAPS_API_KEY = "";
    }
  });

  it("mantenimiento y casa club también paginan con evidencia", async () => {
    jest.spyOn(axios, "get").mockResolvedValue({ data: PNG });
    await prisma.maintenance.createMany({
      data: Array.from({ length: 9 }, (_, i) => ({ guardId: s.maint.id, title: `Mantenimiento ${i}`, category: "Eléctrico", description: "texto ".repeat(300), media: [{ type: "IMAGE", url: `https://cdn.example.test/m${i}.png` }] })),
    });
    for (const path of ["/maintenance/report/pdf", "/reports/club/pdf"]) {
      const res = await binary(api().get(`${V1}${path}?${q}&includeImages=true&includeLocation=false`).set("Authorization", s.admin.auth));
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    }
  });

  it("si el generador falla a la mitad responde 500 genérico, sin el mensaje interno", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const service = await import("@src/modules/reports/incident-report.service");
    jest.spyOn(service, "getIncidentsForReport").mockRejectedValue(new Error("connection string postgres://usuario:clave@host/db"));
    const res = await api().get(`${V1}/reports/incidents/pdf?${q}`).set("Authorization", s.admin.auth);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/postgres:|clave/);
    expect(res.body.success).toBe(false);
    expectOk(await api().get(`${V1}/`));
  });
});
