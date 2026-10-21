/**
 * Integraciones salientes: correo de reportes (sin HTML inyectado), almacenamiento S3 y
 * trabajos programados. Todo se sustituye por dobles: las pruebas nunca envían ni publican nada real.
 */
import { transporter } from "@src/core/config/mail";
import { clearSettingsCache } from "@src/core/settings/app-settings.service";
import { StorageService } from "@src/modules/storage/storage.service";
import { S3Client, NotFound } from "@aws-sdk/client-s3";
import { api, allSessions, bootFlows, disconnectDatabase, expectOk, prisma, Session, V1 } from "./support";

jest.mock("@aws-sdk/lib-storage", () => ({
  Upload: jest.fn().mockImplementation(() => ({ done: jest.fn().mockResolvedValue({}) })),
}));

let s: Record<string, Session>;
let sendMail: jest.SpyInstance;

const waitFor = async (predicate: () => boolean, ms = 3000) => {
  const limit = Date.now() + ms;
  while (!predicate() && Date.now() < limit) await new Promise((r) => setTimeout(r, 25));
  expect(predicate()).toBe(true);
};

beforeAll(() => {
  process.env.MAIL_FROM = "no-responder@example.test";
});
afterAll(disconnectDatabase);
beforeEach(async () => {
  await bootFlows();
  s = await allSessions();
  clearSettingsCache();
  sendMail = jest.spyOn(transporter, "sendMail").mockResolvedValue({} as never);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const setSetting = async (key: string, value: string) => {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value, valueType: "string", group: "notificaciones" } });
  clearSettingsCache();
};

describe("correo de reportes", () => {
  it("una incidencia nueva avisa a los destinatarios configurados, con el HTML del guardia escapado", async () => {
    await setSetting("INCIDENT_EMAIL", "admin@example.test|jefe@example.test");
    const title = `<img src=x onerror=alert(1)> Puerta & "portón"`;
    expectOk(await api().post(`${V1}/incidents`).set("Authorization", s.guard1.auth).send({
      title, description: "<script>robar()</script>",
      media: [{ type: "IMAGE", url: "https://example.test/ok.jpg" }, { type: "IMAGE", url: "javascript:alert(1)" }],
    }), 201);
    await waitFor(() => sendMail.mock.calls.length > 0);
    const mail: any = sendMail.mock.calls[0][0];
    expect(mail.to).toEqual(["admin@example.test", "jefe@example.test"]);
    expect(mail.from).toBe("no-responder@example.test");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(mail.html).toContain("Puerta &amp; &quot;portón&quot;");
    expect(mail.html).toContain('href="https://example.test/ok.jpg"');
    expect(mail.html).not.toContain("javascript:");
  });

  it("un reporte de mantenimiento avisa a su propia lista y también escapa el texto", async () => {
    await setSetting("MAINTENANCE_EMAIL", "mantenimiento@example.test");
    expectOk(await api().post(`${V1}/maintenance`).set("Authorization", s.maint.auth).send({ title: "<b>Fuga</b>", category: "<i>Agua</i>", description: "<u>charco</u>" }), 201);
    await waitFor(() => sendMail.mock.calls.length > 0);
    const mail: any = sendMail.mock.calls[0][0];
    expect(mail.to).toEqual(["mantenimiento@example.test"]);
    expect(mail.html).not.toMatch(/<b>Fuga|<i>Agua|<u>charco/);
    expect(mail.html).toContain("&lt;b&gt;Fuga&lt;/b&gt;");
  });

  it("sin destinatarios configurados no envía nada y el reporte se crea igual", async () => {
    expectOk(await api().post(`${V1}/incidents`).set("Authorization", s.guard1.auth).send({ title: "Sin correo" }), 201);
    await new Promise((r) => setTimeout(r, 200));
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("si el servidor de correo falla, el reporte se crea igual y el error no llega al cliente", async () => {
    await setSetting("INCIDENT_EMAIL", "admin@example.test");
    sendMail.mockRejectedValueOnce(new Error("SMTP 535 credenciales inválidas user:secreto"));
    const res = await api().post(`${V1}/incidents`).set("Authorization", s.guard1.auth).send({ title: "Correo caído" });
    expectOk(res, 201);
    expect(JSON.stringify(res.body)).not.toMatch(/SMTP|secreto/);
    await waitFor(() => sendMail.mock.calls.length > 0);
    expect(await prisma.incident.count({ where: { title: "Correo caído" } })).toBe(1);
  });
});

describe("almacenamiento S3 (servicio)", () => {
  const storage = new StorageService();

  it("sube con un nombre propio o uno generado y devuelve bucket y llave", async () => {
    const file = { buffer: Buffer.from("x"), mimetype: "image/png", originalname: "a b.png" } as Express.Multer.File;
    expect(await storage.uploadFile(file, "bucket", "mi-llave.png")).toEqual({ bucket: "bucket", key: "mi-llave.png" });
    const generated = await storage.uploadFile(file, "bucket");
    expect(generated.key).toMatch(/^\d+_a b\.png$/);
  });

  it("borra el objeto con la llave indicada", async () => {
    const send = jest.spyOn(S3Client.prototype, "send") as unknown as jest.Mock;
    send.mockResolvedValue({});
    await storage.deleteFile("bucket", "carpeta/foto.jpg");
    expect((send.mock.calls[0][0] as any).input).toEqual({ Bucket: "bucket", Key: "carpeta/foto.jpg" });
  });

  it("objectExists: existe, no existe (NotFound) y los demás errores se propagan", async () => {
    const send = jest.spyOn(S3Client.prototype, "send") as unknown as jest.Mock;
    send.mockResolvedValueOnce({});
    expect(await storage.objectExists("bucket", "k")).toBe(true);
    send.mockRejectedValueOnce(new NotFound({ message: "no", $metadata: {} }));
    expect(await storage.objectExists("bucket", "k")).toBe(false);
    send.mockRejectedValueOnce(new Error("AccessDenied"));
    await expect(storage.objectExists("bucket", "k")).rejects.toThrow("AccessDenied");
  });

  it("firma URLs de lectura y de subida que caducan en lo pedido", async () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.AWS_SECRET_ACCESS_KEY = "secreto-de-prueba";
    const signed = new StorageService();
    expect(await signed.getSignedReadUrl("bucket", "k.jpg", 123)).toContain("X-Amz-Expires=123");
    expect(await signed.presignUpload("bucket", "k.jpg", "image/jpeg", 10, 77)).toContain("X-Amz-Expires=77");
    process.env.AWS_ACCESS_KEY_ID = "";
    process.env.AWS_SECRET_ACCESS_KEY = "";
  });
});
