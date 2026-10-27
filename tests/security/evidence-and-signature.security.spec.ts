/**
 * S-30 y S-34: el contenido real de los archivos y la verificación de la evidencia de quejas.
 */
import { contentMatchesDeclaredType, detectMediaFamily } from "@src/core/utils/file-signature";
import { verifyEvidence } from "@src/modules/complaints/complaints.service";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypmp42"), Buffer.alloc(20)]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(30)]);
const SCRIPT = Buffer.from("<script>alert(1)</script>".padEnd(30, " "));

describe("firma de archivos (magic bytes)", () => {
  it("reconoce imagen y video por contenido", () => {
    expect(detectMediaFamily(JPEG)).toBe("jpeg");
    expect(detectMediaFamily(PNG)).toBe("png");
    expect(detectMediaFamily(MP4)).toBe("isobmff");
  });

  it("acepta cuando el contenido coincide con el tipo declarado", () => {
    expect(contentMatchesDeclaredType(JPEG, "image/jpeg")).toBe(true);
    expect(contentMatchesDeclaredType(MP4, "video/mp4")).toBe(true);
    expect(contentMatchesDeclaredType(MP4, "video/quicktime")).toBe(true);
  });

  it("rechaza un ejecutable o un script que dice ser imagen", () => {
    expect(contentMatchesDeclaredType(EXE, "image/jpeg")).toBe(false);
    expect(contentMatchesDeclaredType(SCRIPT, "image/png")).toBe(false);
  });

  it("rechaza un PNG que se declara como video", () => {
    expect(contentMatchesDeclaredType(PNG, "video/mp4")).toBe(false);
  });

  it("rechaza archivos vacíos o muy cortos", () => {
    expect(detectMediaFamily(Buffer.alloc(0))).toBeNull();
    expect(detectMediaFamily(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("verificación de evidencia de quejas", () => {
  const actor = { id: 1, canManage: false, username: "ana.perez" };
  const photo = { type: "IMAGE" as const, url: "https://sitio-malicioso.example/x.jpg", key: "ana_perez_complaints_1.jpg", size: 1 };

  beforeEach(() => {
    process.env.AWS_BUCKET_NAME = "bucket-de-prueba";
    process.env.AWS_REGION = "us-east-2";
  });
  afterEach(() => {
    delete process.env.AWS_BUCKET_NAME;
  });

  it("usa el tamaño real y reconstruye la URL desde la llave", async () => {
    const storage = { getObjectMeta: jest.fn().mockResolvedValue({ size: 2048 }) };
    const [item] = await verifyEvidence(actor, [photo], storage);
    expect(item.size).toBe(2048);
    expect(item.url).toBe("https://bucket-de-prueba.s3.us-east-2.amazonaws.com/ana_perez_complaints_1.jpg");
  });

  it("rechaza un archivo que no es del usuario (403)", async () => {
    const storage = { getObjectMeta: jest.fn().mockResolvedValue({ size: 10 }) };
    await expect(verifyEvidence(actor, [{ ...photo, key: "otra_persona_complaints_1.jpg" }], storage)).rejects.toMatchObject({ code: "EVIDENCE_NOT_OWNED", status: 403 });
  });

  it("rechaza un archivo que no existe en el almacenamiento (409)", async () => {
    const storage = { getObjectMeta: jest.fn().mockResolvedValue(null) };
    await expect(verifyEvidence(actor, [photo], storage)).rejects.toMatchObject({ code: "EVIDENCE_NOT_FOUND", status: 409 });
  });

  it("rechaza una foto mayor a 5 MB aunque el cliente diga que pesa poco (400)", async () => {
    const storage = { getObjectMeta: jest.fn().mockResolvedValue({ size: 6 * 1024 * 1024 }) };
    await expect(verifyEvidence(actor, [photo], storage)).rejects.toMatchObject({ code: "EVIDENCE_TOO_LARGE", status: 400 });
  });

  it("sin almacenamiento configurado no verifica (desarrollo y pruebas)", async () => {
    delete process.env.AWS_BUCKET_NAME;
    const storage = { getObjectMeta: jest.fn() };
    expect(await verifyEvidence(actor, [photo], storage)).toEqual([photo]);
    expect(storage.getObjectMeta).not.toHaveBeenCalled();
  });
});
