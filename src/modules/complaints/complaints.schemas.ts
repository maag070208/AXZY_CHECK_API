import { z } from "zod";

export const COMPLAINT_CATEGORIES = ["MANTENIMIENTO", "SEGURIDAD", "RUIDO", "LIMPIEZA", "ADMINISTRACION", "SUGERENCIA", "OTRA"] as const;
export const COMPLAINT_STATUSES = ["NEW", "IN_REVIEW", "WAITING_RESIDENT", "RESOLVED", "CLOSED"] as const;

export const MAX_COMPLAINT_PHOTOS = 3;
export const MAX_COMPLAINT_PHOTO_BYTES = 5 * 1024 * 1024;

/** Foto ya subida con `POST /uploads`. El tamaño lo reporta el cliente (ver nota en el plan). */
const complaintPhoto = z.object({
  type: z.literal("IMAGE"),
  url: z.string().url(),
  key: z.string().trim().min(1).max(500),
  size: z.number().int().positive().max(MAX_COMPLAINT_PHOTO_BYTES, "cada foto puede pesar máximo 5 MB"),
});

export const createComplaintBody = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  title: z.string().trim().min(3, "debe tener al menos 3 caracteres").max(120, "no puede pasar de 120 caracteres"),
  description: z.string().trim().min(10, "debe tener al menos 10 caracteres").max(2000, "no puede pasar de 2000 caracteres"),
  media: z.array(complaintPhoto).max(MAX_COMPLAINT_PHOTOS, "máximo 3 fotos").nullish(),
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
