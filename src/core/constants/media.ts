/** Tipos de archivo permitidos para evidencias (fotos y video). Única fuente para multer y para la subida prefirmada. */
export const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/3gpp",
  "video/webm",
] as const;

export type MediaContentType = (typeof ALLOWED_MEDIA_TYPES)[number];

export const MEDIA_EXTENSIONS: Record<MediaContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
  "video/webm": "webm",
};

/** Tamaño máximo declarado en la subida prefirmada (igual que multer). */
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

/** La URL prefirmada caduca a los 5 minutos. */
export const MEDIA_PRESIGN_TTL_SECONDS = 300;
