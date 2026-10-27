import { NextFunction, Request, Response } from "express";
import { StorageService } from "@src/modules/storage/storage.service";

/**
 * S-24: los archivos (fotos de perfil, evidencias de quejas e incidencias) se guardan con la URL pública de S3.
 * Esta red de seguridad **reescribe en cada respuesta** esas URLs por URLs firmadas de lectura de vida corta,
 * de modo que el bucket pueda quedar privado sin que los clientes (WEB/APP) cambien. Una URL guardada con una
 * firma vencida se vuelve a firmar al leerla.
 */
const TTL_SECONDS = Number(process.env.MEDIA_URL_TTL_SECONDS ?? 3600);

let storage: StorageService | null = null;
const getStorage = () => (storage ??= new StorageService());

/** Prefijo público del bucket configurado, o null si no hay bucket (pruebas, desarrollo sin S3). */
const publicPrefix = (): { prefix: string; bucket: string } | null => {
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) return null;
  const region = process.env.AWS_REGION || "us-east-2";
  return { prefix: `https://${bucket}.s3.${region}.amazonaws.com/`, bucket };
};

/** Devuelve la URL firmada si el texto es una URL del bucket; si no, el mismo texto. */
export const signIfBucketUrl = async (value: string): Promise<string> => {
  const target = publicPrefix();
  if (!target || !value.startsWith(target.prefix)) return value;
  const withoutQuery = value.split("?")[0];
  let key = withoutQuery.slice(target.prefix.length);
  try {
    key = decodeURIComponent(key);
  } catch {
    /* la llave se usa tal cual */
  }
  if (!key) return value;
  return getStorage().getSignedReadUrl(target.bucket, key, TTL_SECONDS);
};

/** Copia profunda del cuerpo con todas las URLs del bucket firmadas. */
export const signMediaUrls = async <T>(value: T, ancestors = new Set<object>()): Promise<T> => {
  if (typeof value === "string") return (await signIfBucketUrl(value)) as unknown as T;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (ancestors.has(value as object)) return undefined as unknown as T;

  ancestors.add(value as object);
  try {
    if (Array.isArray(value)) {
      return (await Promise.all(value.map((item) => signMediaUrls(item, ancestors)))) as unknown as T;
    }
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(
        // `uploadUrl` es la URL PUT prefirmada de /media/presign: re-firmarla como lectura la invalidaría.
        async ([key, item]) => [key, key === "uploadUrl" ? item : await signMediaUrls(item, ancestors)] as const,
      ),
    );
    return Object.fromEntries(entries) as T;
  } finally {
    ancestors.delete(value as object);
  }
};

/** Envuelve res.json; si no hay bucket configurado no hace nada. */
export const signResponseMediaUrls = (_req: Request, res: Response, next: NextFunction) => {
  if (!publicPrefix()) return next();
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown) => {
    signMediaUrls(body)
      .then((signed) => originalJson(signed))
      .catch(() => originalJson(body)); // si falla la firma, la respuesta no se pierde
    return res;
  };
  next();
};
