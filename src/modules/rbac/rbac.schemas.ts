import { z } from "zod";

export const roleNameParam = z.object({
  roleName: z.string().min(1).max(20),
});

export const updateRolePermissionsBody = z.object({
  permissions: z.array(z.string().min(1).max(80)).max(200),
});
