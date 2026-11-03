import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FLOW_PASSWORD, FLOW_SCHEDULE, FLOW_USERS, FlowUserKey } from "./constants";
import { joinClient } from "@src/core/scope/membership";

export type StaffIds = Record<FlowUserKey, number> & { scheduleId: number; organizationId: number; clientId: number };

/**
 * Flujo "personal": un usuario por rol (ADMIN, SHIFT, GUARD×2, MAINT, RESDN) y un
 * horario de 24 h, todos en el cliente `tenant`. Requiere los roles del seed base. Idempotente por `username`.
 */
export const staffFlow = async (prisma: PrismaClient, tenant: { organizationId: number; clientId: number }): Promise<StaffIds> => {
  const password = await bcrypt.hash(FLOW_PASSWORD, 10);
  const schedule = await prisma.schedule.upsert({
    where: { name: FLOW_SCHEDULE.name },
    update: {},
    create: { ...FLOW_SCHEDULE },
  });

  const ids: Partial<StaffIds> = { scheduleId: schedule.id, ...tenant };
  for (const key of Object.keys(FLOW_USERS) as FlowUserKey[]) {
    const def = FLOW_USERS[key];
    const role = await prisma.role.findUniqueOrThrow({ where: { name: def.role } });
    const user = await prisma.user.upsert({
      where: { username: def.username },
      update: {},
      create: {
        name: def.name,
        lastName: def.lastName,
        username: def.username,
        password,
        roleId: role.id,
        // Los residentes no tienen horario; el resto sí (el login lo exige).
        scheduleId: def.role === "RESDN" ? null : schedule.id,
        organizationId: tenant.organizationId,
      },
    });
    await joinClient(prisma, { id: user.id, roleName: def.role }, tenant);
    ids[key] = user.id;
  }
  return ids as StaffIds;
};
