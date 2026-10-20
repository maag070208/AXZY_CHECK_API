import { randomUUID } from "crypto";
import { MediaFileStatus } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { MEDIA_EXTENSIONS, MEDIA_PRESIGN_TTL_SECONDS, MediaContentType } from "@src/core/constants/media";
import { assertStatusUpdated } from "@src/core/transitions/transitions";
import { StorageService } from "@src/modules/storage/storage.service";

const storage = new StorageService();

const bucketName = (): string => {
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) throw new Error("Storage bucket name not configured");
  return bucket;
};

/**
 * Registra el archivo como PENDING y devuelve una URL prefirmada para subirlo
 * directo a S3. El cliente sube con PUT el mismo Content-Type y tamaño declarados.
 */
export const presignMedia = async (
  userId: number,
  input: { contentType: MediaContentType; sizeBytes: number }
) => {
  const key = `media/${randomUUID()}.${MEDIA_EXTENSIONS[input.contentType]}`;
  const media = await prismaClient.mediaFile.create({
    data: { key, contentType: input.contentType, sizeBytes: input.sizeBytes, uploadedById: userId },
  });
  const uploadUrl = await storage.presignUpload(
    bucketName(),
    key,
    input.contentType,
    input.sizeBytes,
    MEDIA_PRESIGN_TTL_SECONDS
  );
  return { mediaId: media.id, key, uploadUrl, expiresInSeconds: MEDIA_PRESIGN_TTL_SECONDS };
};

/**
 * Confirma que el objeto llegó a S3. Solo lo confirma quien lo subió.
 * Idempotente: confirmar dos veces devuelve el mismo registro.
 */
export const confirmMedia = async (userId: number, id: number) => {
  const media = await prismaClient.mediaFile.findUnique({ where: { id } });
  if (!media) throw new AppError("MEDIA_NOT_FOUND", "Archivo no encontrado", 404);
  if (media.uploadedById !== userId) {
    throw new AppError("MEDIA_NOT_OWNER", "Solo quien subió el archivo puede confirmarlo", 403);
  }
  if (media.status === MediaFileStatus.CONFIRMED) return media;

  const exists = await storage.objectExists(bucketName(), media.key);
  if (!exists) throw new AppError("MEDIA_NOT_UPLOADED", "El archivo aún no está en el almacenamiento", 409);

  const { count } = await prismaClient.mediaFile.updateMany({
    where: { id, status: MediaFileStatus.PENDING },
    data: { status: MediaFileStatus.CONFIRMED, confirmedAt: new Date() },
  });
  assertStatusUpdated(count);

  return prismaClient.mediaFile.findUniqueOrThrow({ where: { id } });
};
