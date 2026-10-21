import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { getSetting } from "@src/core/settings/app-settings.service";
import { todayDateOnly } from "@src/modules/properties/occupancy.service";
import { StorageService } from "@src/modules/storage/storage.service";

const storage = new StorageService();
const READ_URL_TTL_SECONDS = 900;

const ageOn = (birthDate: Date, on: Date) => {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const before =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (before) age--;
  return age;
};

/** Menores: sin documentos (T-A2-08). Usa la misma edad mínima que la cuenta de APP. */
const assertNotMinor = async (personId: number) => {
  const person = await prismaClient.person.findUnique({ where: { id: personId }, select: { birthDate: true } });
  if (!person) throw new AppError("PERSON_NOT_FOUND", "Persona no encontrada", 404);
  if (!person.birthDate) return;
  const minAge = Number(await getSetting("resident.minAgeForAccount", "18")) || 18;
  if (ageOn(person.birthDate, await todayDateOnly()) < minAge) {
    throw new AppError("PERSON_MINOR_NO_DOCUMENTS", "Una persona menor de edad no tiene documentos", 400);
  }
};

export const uploadDocument = async (
  personId: number,
  input: { kindCode: string; mediaFileId: number; expiresAt?: string | null; notes?: string | null },
) => {
  await assertNotMinor(personId);
  const kind = await prismaClient.documentKind.findUnique({ where: { code: input.kindCode } });
  if (!kind || !kind.active) throw new AppError("DOCUMENT_KIND_INVALID", "Tipo de documento no válido", 400);
  if (kind.expires && !input.expiresAt) throw new AppError("DOCUMENT_EXPIRY_REQUIRED", "Este documento necesita fecha de vencimiento", 400);

  const media = await prismaClient.mediaFile.findUnique({ where: { id: input.mediaFileId } });
  if (!media || media.status !== "CONFIRMED") throw new AppError("MEDIA_NOT_CONFIRMED", "El archivo no está confirmado", 409);
  if (!media.isPrivate) throw new AppError("DOCUMENT_FILE_NOT_PRIVATE", "El documento debe subirse como privado", 400);

  return prismaClient.personDocument.create({
    data: {
      personId,
      kindId: kind.id,
      mediaFileId: media.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      notes: input.notes ?? null,
    },
    include: { kind: true },
  });
};

export const listDocuments = (personId: number) =>
  prismaClient.personDocument.findMany({
    where: { personId },
    orderBy: { createdAt: "desc" },
    select: { id: true, expiresAt: true, notes: true, createdAt: true, kind: { select: { code: true, name: true } } },
  });

/** URL firmada de lectura (15 min). El archivo nunca tiene URL pública (T-A2-T6). */
export const documentReadUrl = async (personId: number, documentId: number) => {
  const doc = await prismaClient.personDocument.findFirst({
    where: { id: documentId, personId },
    include: { mediaFile: true },
  });
  if (!doc) throw new AppError("DOCUMENT_NOT_FOUND", "Documento no encontrado", 404);
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) throw new AppError("STORAGE_NOT_CONFIGURED", "El almacenamiento de archivos no está disponible", 503);
  return { url: await storage.getSignedReadUrl(bucket, doc.mediaFile.key, READ_URL_TTL_SECONDS), expiresInSeconds: READ_URL_TTL_SECONDS };
};

/** Documentos vencidos o que vencen en `days` días (alerta, T-A2-T6). */
export const expiringDocuments = async (days: number) => {
  const today = await todayDateOnly();
  const limit = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  return prismaClient.personDocument.findMany({
    where: { expiresAt: { lte: limit } },
    orderBy: { expiresAt: "asc" },
    select: {
      id: true,
      expiresAt: true,
      person: { select: { id: true, firstName: true, lastName: true } },
      kind: { select: { code: true, name: true } },
    },
  });
};
