/**
 * Flujo: archivos y evidencias. Subida directa (multipart), subida prefirmada con confirmación,
 * lectura firmada de documentos privados y borrado de evidencia. S3 real nunca se usa:
 * el almacenamiento se sustituye por un doble.
 */
import { StorageService } from "@src/modules/storage/storage.service";
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;

const uploadFile = jest.spyOn(StorageService.prototype, "uploadFile");
const presignUpload = jest.spyOn(StorageService.prototype, "presignUpload");
const objectExists = jest.spyOn(StorageService.prototype, "objectExists");
const getSignedReadUrl = jest.spyOn(StorageService.prototype, "getSignedReadUrl");
const deleteFile = jest.spyOn(StorageService.prototype, "deleteFile");

beforeAll(() => {
  process.env.AWS_BUCKET_NAME = "bucket-de-pruebas";
  process.env.AWS_REGION = "us-east-2";
});
afterAll(async () => {
  process.env.AWS_BUCKET_NAME = "";
  uploadFile.mockRestore();
  presignUpload.mockRestore();
  objectExists.mockRestore();
  getSignedReadUrl.mockRestore();
  deleteFile.mockRestore();
  await disconnectDatabase();
});

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
  uploadFile.mockImplementation(async (_file, bucket, key) => ({ bucket, key: key as string }));
  presignUpload.mockResolvedValue("https://bucket-de-pruebas.s3.example.test/firmada");
  objectExists.mockResolvedValue(true);
  getSignedReadUrl.mockResolvedValue("https://bucket-de-pruebas.s3.example.test/lectura");
  deleteFile.mockResolvedValue(undefined);
});

describe("subida directa POST /uploads", () => {
  const U = `${V1}/uploads`;
  const png = Buffer.from("89504e470d0a1a0a", "hex");

  it("camino feliz: sube una imagen y devuelve URL, tipo y llave con el nombre saneado", async () => {
    const res = await api().post(U).set("Authorization", s.guard1.auth).field("location", "Alberca / Norte #1").attach("file", png, { filename: "foto.png", contentType: "image/png" });
    const data = expectOk(res);
    expect(data).toMatchObject({ type: "IMAGE", mimetype: "image/png", size: png.length, bucket: "bucket-de-pruebas" });
    expect(data.key).toMatch(/^flow_guard1_Alberca___Norte__1_\d{14}\.png$/);
    expect(data.url).toBe(`https://bucket-de-pruebas.s3.us-east-2.amazonaws.com/${data.key}`);
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it("un video se clasifica como VIDEO", async () => {
    const data = expectOk(await api().post(U).set("Authorization", s.maint.auth).attach("file", Buffer.from("video"), { filename: "clip.mp4", contentType: "video/mp4" }));
    expect(data.type).toBe("VIDEO");
    expect(data.key).toMatch(/^flow_maint_unknown_/);
  });

  it("sin archivo → 400; tipo no permitido → 400; otro campo de archivo → 400", async () => {
    expectFail(await api().post(U).set("Authorization", s.guard1.auth).field("location", "x"), 400);
    const pdf = await api().post(U).set("Authorization", s.guard1.auth).attach("file", Buffer.from("%PDF-1.4"), { filename: "doc.pdf", contentType: "application/pdf" });
    expectFail(pdf, 400, "FILE_TYPE_INVALID");
    const script = await api().post(U).set("Authorization", s.guard1.auth).attach("file", Buffer.from("<script>"), { filename: "x.html", contentType: "text/html" });
    expectFail(script, 400, "FILE_TYPE_INVALID");
    const other = await api().post(U).set("Authorization", s.guard1.auth).attach("otro", png, { filename: "foto.png", contentType: "image/png" });
    expectFail(other, 400, "UPLOAD_INVALID");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("un archivo mayor a 50 MB → 413", async () => {
    const big = Buffer.alloc(50 * 1024 * 1024 + 1024);
    const res = await api().post(U).set("Authorization", s.guard1.auth).attach("file", big, { filename: "grande.mp4", contentType: "video/mp4" });
    expectFail(res, 413, "FILE_TOO_LARGE");
  });

  it("sin almacenamiento configurado → 503 claro, sin filtrar la configuración", async () => {
    process.env.AWS_BUCKET_NAME = "";
    try {
      const res = await api().post(U).set("Authorization", s.guard1.auth).attach("file", png, { filename: "foto.png", contentType: "image/png" });
      expectFail(res, 503, "STORAGE_NOT_CONFIGURED");
      expect(JSON.stringify(res.body)).not.toMatch(/bucket/i);
    } finally {
      process.env.AWS_BUCKET_NAME = "bucket-de-pruebas";
    }
  });

  it("si S3 falla → 500 genérico sin detalles; sin token → 401", async () => {
    uploadFile.mockRejectedValueOnce(new Error("AccessDenied: arn:aws:iam::123456789012:user/secreto"));
    const res = await api().post(U).set("Authorization", s.guard1.auth).attach("file", png, { filename: "foto.png", contentType: "image/png" });
    expectFail(res, 500);
    expect(JSON.stringify(res.body)).not.toMatch(/arn:|AccessDenied/);
    expectFail(await api().post(U).attach("file", png, { filename: "foto.png", contentType: "image/png" }), 401);
  });
});

describe("subida prefirmada /media", () => {
  const M = `${V1}/media`;

  it("camino feliz: pedir URL → subir → confirmar (idempotente) → usarla como documento privado", async () => {
    const presigned = expectOk(await api().post(`${M}/presign`).set("Authorization", s.admin.auth).send({ contentType: "image/jpeg", sizeBytes: 2048, isPrivate: true }), 201);
    expect(presigned).toMatchObject({ key: expect.stringMatching(/^media\/.+\.jpg$/), uploadUrl: "https://bucket-de-pruebas.s3.example.test/firmada", expiresInSeconds: 300 });
    expect(presignUpload).toHaveBeenCalledWith("bucket-de-pruebas", presigned.key, "image/jpeg", 2048, 300);

    const confirmed = expectOk(await api().post(`${M}/${presigned.mediaId}/confirm`).set("Authorization", s.admin.auth));
    expect(confirmed).toMatchObject({ status: "CONFIRMED", isPrivate: true });
    expect(expectOk(await api().post(`${M}/${presigned.mediaId}/confirm`).set("Authorization", s.admin.auth)).status).toBe("CONFIRMED");

    const doc = expectOk(await api().post(`${V1}/persons/${flows.properties.ownerPersonId}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "OTHER", mediaFileId: presigned.mediaId }), 201);
    const url = expectOk(await api().get(`${V1}/persons/${flows.properties.ownerPersonId}/documents/${doc.id}/url`).set("Authorization", s.admin.auth));
    expect(url).toEqual({ url: "https://bucket-de-pruebas.s3.example.test/lectura", expiresInSeconds: 900 });
    expect(getSignedReadUrl).toHaveBeenCalledWith("bucket-de-pruebas", presigned.key, 900);
  });

  it.each([
    ["tipo no permitido", { contentType: "application/pdf", sizeBytes: 10 }],
    ["sin tipo", { sizeBytes: 10 }],
    ["tamaño cero", { contentType: "image/png", sizeBytes: 0 }],
    ["tamaño negativo", { contentType: "image/png", sizeBytes: -5 }],
    ["tamaño decimal", { contentType: "image/png", sizeBytes: 1.5 }],
    ["tamaño enorme", { contentType: "image/png", sizeBytes: 51 * 1024 * 1024 }],
    ["tamaño como texto", { contentType: "image/png", sizeBytes: "grande" }],
    ["privado no booleano", { contentType: "image/png", sizeBytes: 10, isPrivate: "si" }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(`${M}/presign`).set("Authorization", s.guard1.auth).send(body), 400, "VALIDATION_ERROR");
    expect(await prisma.mediaFile.count()).toBe(0);
  });

  it("confirmar: solo quien subió (403), que exista (404), que ya esté en S3 (409) e id válido (400)", async () => {
    const presigned = expectOk(await api().post(`${M}/presign`).set("Authorization", s.guard1.auth).send({ contentType: "video/mp4", sizeBytes: 10 }), 201);
    expectFail(await api().post(`${M}/${presigned.mediaId}/confirm`).set("Authorization", s.guard2.auth), 403, "MEDIA_NOT_OWNER");
    expectFail(await api().post(`${M}/${MISSING_ID}/confirm`).set("Authorization", s.guard1.auth), 404, "MEDIA_NOT_FOUND");
    expectFail(await api().post(`${M}/abc/confirm`).set("Authorization", s.guard1.auth), 400, "VALIDATION_ERROR");
    objectExists.mockResolvedValueOnce(false);
    expectFail(await api().post(`${M}/${presigned.mediaId}/confirm`).set("Authorization", s.guard1.auth), 409, "MEDIA_NOT_UPLOADED");
    expect((await prisma.mediaFile.findUniqueOrThrow({ where: { id: presigned.mediaId } })).status).toBe("PENDING");
  });

  it("sin almacenamiento configurado → 503; sin token → 401", async () => {
    process.env.AWS_BUCKET_NAME = "";
    try {
      expectFail(await api().post(`${M}/presign`).set("Authorization", s.guard1.auth).send({ contentType: "image/png", sizeBytes: 10 }), 503, "STORAGE_NOT_CONFIGURED");
    } finally {
      process.env.AWS_BUCKET_NAME = "bucket-de-pruebas";
    }
    expectFail(await api().post(`${M}/presign`).send({ contentType: "image/png", sizeBytes: 10 }), 401);
  });

  it("lectura de documentos: sin almacenamiento 503; documento ajeno o inexistente 404", async () => {
    const file = await prisma.mediaFile.create({ data: { key: "media/x.jpg", contentType: "image/jpeg", sizeBytes: 1, status: "CONFIRMED", isPrivate: true } });
    const doc = await prisma.personDocument.create({ data: { personId: flows.properties.ownerPersonId, kindId: (await prisma.documentKind.findUniqueOrThrow({ where: { code: "OTHER" } })).id, mediaFileId: file.id } });
    expectFail(await api().get(`${V1}/persons/${flows.properties.tenantPersonId}/documents/${doc.id}/url`).set("Authorization", s.admin.auth), 404, "DOCUMENT_NOT_FOUND");
    expectFail(await api().get(`${V1}/persons/${flows.properties.ownerPersonId}/documents/${MISSING_ID}/url`).set("Authorization", s.admin.auth), 404, "DOCUMENT_NOT_FOUND");
    process.env.AWS_BUCKET_NAME = "";
    try {
      expectFail(await api().get(`${V1}/persons/${flows.properties.ownerPersonId}/documents/${doc.id}/url`).set("Authorization", s.admin.auth), 503, "STORAGE_NOT_CONFIGURED");
    } finally {
      process.env.AWS_BUCKET_NAME = "bucket-de-pruebas";
    }
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().get(`${V1}/persons/${flows.properties.ownerPersonId}/documents/${doc.id}/url`).set("Authorization", s[key].auth), 403);
    }
  });
});

describe("evidencia de reportes en el almacenamiento", () => {
  it("al quitar una evidencia de incidencia, bitácora o casa club también se borra de S3", async () => {
    await prisma.incident.update({ where: { id: flows.reports.pendingIncidentId }, data: { media: [{ type: "IMAGE", url: "https://x.test/a/uno.jpg", key: "a/uno.jpg" }] } });
    expectOk(await api().delete(`${V1}/incidents/${flows.reports.pendingIncidentId}/media?key=a/uno.jpg`).set("Authorization", s.admin.auth));
    await prisma.kardex.update({ where: { id: flows.reports.kardexId }, data: { media: [{ type: "IMAGE", url: "https://x.test/k/dos.jpg" }] } });
    expectOk(await api().delete(`${V1}/kardex/${flows.reports.kardexId}/media?key=dos.jpg`).set("Authorization", s.admin.auth));
    await prisma.incident.update({ where: { id: flows.reports.clubReportId }, data: { media: [{ type: "IMAGE", url: "https://x.test/c/tres.jpg", key: "c/tres.jpg" }] } });
    expectOk(await api().delete(`${V1}/club/${flows.reports.clubReportId}/media?key=c/tres.jpg`).set("Authorization", s.admin.auth));
    expect(deleteFile.mock.calls.map((c) => c[1])).toEqual(["a/uno.jpg", "dos.jpg", "c/tres.jpg"]);
    expect((await prisma.kardex.findUniqueOrThrow({ where: { id: flows.reports.kardexId } })).media).toEqual([]);
  });

  it("si S3 falla al borrar, la evidencia igual se quita del registro", async () => {
    deleteFile.mockRejectedValueOnce(new Error("S3 caído"));
    await prisma.incident.update({ where: { id: flows.reports.pendingIncidentId }, data: { media: [{ type: "IMAGE", url: "https://x.test/a/uno.jpg", key: "a/uno.jpg" }] } });
    expectOk(await api().delete(`${V1}/incidents/${flows.reports.pendingIncidentId}/media?key=a/uno.jpg`).set("Authorization", s.admin.auth));
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: flows.reports.pendingIncidentId } })).media).toEqual([]);
  });
});
