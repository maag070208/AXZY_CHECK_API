/**
 * [T-F0-09] Subida prefirmada: la URL caduca en 5 min, solo quien subió confirma,
 * y confirmar un archivo que no llegó a S3 falla. S3 real no se usa en pruebas.
 */
import request from "supertest";
import { app } from "@src/app";
import { StorageService } from "@src/modules/storage/storage.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const BASE = "/api/v1/media";

beforeAll(() => {
  process.env.AWS_BUCKET_NAME = "checkapp-test-bucket";
  process.env.AWS_ACCESS_KEY_ID = "TESTKEY";
  process.env.AWS_SECRET_ACCESS_KEY = "TESTSECRET";
});

beforeEach(async () => {
  await resetDatabase();
  jest.restoreAllMocks();
});

afterAll(async () => {
  delete process.env.AWS_BUCKET_NAME;
  await disconnectDatabase();
});

const auth = async (role: "GUARD" | "SHIFT" = "GUARD") => {
  const user = await buildUser(role);
  return { user, token: `Bearer ${tokenFor(user)}` };
};

describe("POST /media/presign", () => {
  it("devuelve una URL PUT que caduca en 300 s y registra el archivo como PENDING", async () => {
    const { user, token } = await auth();
    const res = await request(app).post(`${BASE}/presign`).set("Authorization", token).send({ contentType: "image/jpeg", sizeBytes: 1024 });

    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^media\/.+\.jpg$/);
    expect(res.body.data.uploadUrl).toContain("X-Amz-Expires=300");
    expect(res.body.data.expiresInSeconds).toBe(300);

    const row = await prisma.mediaFile.findUniqueOrThrow({ where: { id: res.body.data.mediaId } });
    expect(row).toMatchObject({ status: "PENDING", uploadedById: user.id, sizeBytes: 1024 });
  });

  it("rechaza un tipo de archivo que no está en la lista", async () => {
    const { token } = await auth();
    const res = await request(app).post(`${BASE}/presign`).set("Authorization", token).send({ contentType: "application/pdf", sizeBytes: 10 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un tamaño por encima del máximo", async () => {
    const { token } = await auth();
    const res = await request(app).post(`${BASE}/presign`).set("Authorization", token).send({ contentType: "image/png", sizeBytes: 51 * 1024 * 1024 });
    expect(res.status).toBe(400);
  });

  it("sin token no hay acceso", async () => {
    const res = await request(app).post(`${BASE}/presign`).send({ contentType: "image/png", sizeBytes: 10 });
    expect(res.status).toBe(401);
  });
});

describe("POST /media/:id/confirm", () => {
  it("confirma cuando el objeto ya está en S3", async () => {
    const { token } = await auth();
    const presigned = await request(app).post(`${BASE}/presign`).set("Authorization", token).send({ contentType: "image/png", sizeBytes: 10 });
    jest.spyOn(StorageService.prototype, "objectExists").mockResolvedValue(true);

    const res = await request(app).post(`${BASE}/${presigned.body.data.mediaId}/confirm`).set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CONFIRMED");
    expect(res.body.data.confirmedAt).not.toBeNull();
  });

  it("falla con 409 si el archivo nunca llegó a S3", async () => {
    const { token } = await auth();
    const presigned = await request(app).post(`${BASE}/presign`).set("Authorization", token).send({ contentType: "image/png", sizeBytes: 10 });
    jest.spyOn(StorageService.prototype, "objectExists").mockResolvedValue(false);

    const res = await request(app).post(`${BASE}/${presigned.body.data.mediaId}/confirm`).set("Authorization", token);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("MEDIA_NOT_UPLOADED");
    const row = await prisma.mediaFile.findUniqueOrThrow({ where: { id: presigned.body.data.mediaId } });
    expect(row.status).toBe("PENDING");
  });

  it("un archivo inexistente responde 404", async () => {
    const { token } = await auth();
    const res = await request(app).post(`${BASE}/999999/confirm`).set("Authorization", token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MEDIA_NOT_FOUND");
  });

  it("solo quien subió el archivo puede confirmarlo", async () => {
    const owner = await auth();
    const presigned = await request(app).post(`${BASE}/presign`).set("Authorization", owner.token).send({ contentType: "image/png", sizeBytes: 10 });
    const other = await auth();
    jest.spyOn(StorageService.prototype, "objectExists").mockResolvedValue(true);

    const res = await request(app).post(`${BASE}/${presigned.body.data.mediaId}/confirm`).set("Authorization", other.token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MEDIA_NOT_OWNER");
  });

  it("confirmar dos veces devuelve el mismo registro sin volver a consultar S3", async () => {
    const { token } = await auth();
    const presigned = await request(app).post(`${BASE}/presign`).set("Authorization", token).send({ contentType: "image/png", sizeBytes: 10 });
    const spy = jest.spyOn(StorageService.prototype, "objectExists").mockResolvedValue(true);

    await request(app).post(`${BASE}/${presigned.body.data.mediaId}/confirm`).set("Authorization", token);
    const again = await request(app).post(`${BASE}/${presigned.body.data.mediaId}/confirm`).set("Authorization", token);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("CONFIRMED");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
