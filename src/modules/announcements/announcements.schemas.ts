import { z } from "zod";
import { positiveId } from "@src/core/validation/common";

export const createAnnouncementBody = z
  .object({
    title: z.string().trim().min(3, "escribe un título").max(120),
    body: z.string().trim().min(3, "escribe el mensaje").max(2000),
    audience: z.enum(["ALL", "PROPERTY", "ROLE"]),
    propertyId: positiveId.optional(),
    roleName: z.string().trim().min(2).max(30).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.audience === "PROPERTY" && !value.propertyId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyId"], message: "elige una propiedad" });
    }
    if (value.audience === "ROLE" && !value.roleName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["roleName"], message: "elige un rol" });
    }
  });

export const announcementsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const pushDeviceBody = z.object({
  token: z.string().trim().min(20, "token inválido").max(500),
  platform: z.enum(["android", "ios"]).default("android"),
});

export const notificationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});
