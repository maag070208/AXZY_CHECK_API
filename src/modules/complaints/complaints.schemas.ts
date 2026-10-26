import { z } from "zod";

export const COMPLAINT_CATEGORIES = ["MANTENIMIENTO", "SEGURIDAD", "RUIDO", "LIMPIEZA", "ADMINISTRACION", "SUGERENCIA", "OTRA"] as const;
export const COMPLAINT_STATUSES = ["NEW", "IN_REVIEW", "WAITING_RESIDENT", "RESOLVED", "CLOSED"] as const;

export const MAX_COMPLAINT_EVIDENCE = 3;
export const MAX_COMPLAINT_VIDEOS = 1;
export const MAX_COMPLAINT_VIDEO_SECONDS = 30;
export const MAX_COMPLAINT_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_COMPLAINT_VIDEO_BYTES = 30 * 1024 * 1024;

/** Evidencia ya subida con `POST /uploads`. El tamaño lo reporta el servidor de uploads; la duración la limita la APP. */
const complaintMedia = z
  .object({
    type: z.enum(["IMAGE", "VIDEO"]),
    url: z.string().url(),
    key: z.string().trim().min(1).max(500),
    size: z.number().int().positive(),
  })
  .superRefine((media, ctx) => {
    const limit = media.type === "VIDEO" ? MAX_COMPLAINT_VIDEO_BYTES : MAX_COMPLAINT_PHOTO_BYTES;
    if (media.size > limit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["size"], message: media.type === "VIDEO" ? "el video puede pesar máximo 30 MB" : "cada foto puede pesar máximo 5 MB" });
    }
  });

export const createComplaintBody = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  title: z.string().trim().min(3, "debe tener al menos 3 caracteres").max(120, "no puede pasar de 120 caracteres"),
  description: z.string().trim().min(10, "debe tener al menos 10 caracteres").max(2000, "no puede pasar de 2000 caracteres"),
  media: z
    .array(complaintMedia)
    .max(MAX_COMPLAINT_EVIDENCE, "máximo 3 archivos de evidencia")
    .refine((items) => items.filter((m) => m.type === "VIDEO").length <= MAX_COMPLAINT_VIDEOS, "máximo 1 video")
    .nullish(),
}).strict();

export const listComplaintsQuery = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  category: z.enum(COMPLAINT_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const addComplaintMessageBody = z.object({
  body: z.string().trim().min(2, "debe tener al menos 2 caracteres").max(2000, "no puede pasar de 2000 caracteres"),
  internal: z.boolean().optional().default(false),
}).strict();

export const changeComplaintStatusBody = z.object({
  status: z.enum(COMPLAINT_STATUSES),
}).strict();
