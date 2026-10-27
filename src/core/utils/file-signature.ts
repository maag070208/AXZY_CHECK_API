/**
 * S-30: detecta el tipo real de un archivo por sus primeros bytes ("magic bytes"), sin confiar en el
 * `Content-Type` ni en la extensión que declara el cliente.
 */
export type MediaFamily = "jpeg" | "png" | "webp" | "isobmff" | "avi" | "matroska";

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, start: number, end: number) => buf.subarray(start, end).toString("latin1");

/** Familia real del archivo, o null si no es una imagen/video permitido. */
export const detectMediaFamily = (buf: Buffer): MediaFamily | null => {
  if (!buf || buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "webp";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 11) === "AVI") return "avi";
  if (ascii(buf, 4, 8) === "ftyp") return "isobmff"; // mp4, mov, 3gp
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "matroska"; // mkv, webm
  return null;
};

/** Familia que corresponde a un tipo MIME declarado. */
export const familyOfMime = (mime: string): MediaFamily | null => {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
    case "video/quicktime":
    case "video/3gpp":
      return "isobmff";
    case "video/x-msvideo":
      return "avi";
    case "video/x-matroska":
    case "video/webm":
      return "matroska";
    default:
      return null;
  }
};

/** ¿El contenido real del archivo coincide con el tipo que declara? */
export const contentMatchesDeclaredType = (buf: Buffer, declaredMime: string): boolean => {
  const real = detectMediaFamily(buf);
  return real !== null && real === familyOfMime(declaredMime);
};
