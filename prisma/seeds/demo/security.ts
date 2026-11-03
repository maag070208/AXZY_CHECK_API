import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hackerLog } from "../base/logger";
import { joinClient } from "@src/core/scope/membership";

export const securitySeed = async (prisma: PrismaClient, tenant: { organizationId: number; clientId: number }) => {
  const password = await bcrypt.hash("123456", 10);
  hackerLog.info('SECURITY', 'Initializing Security Layer');

  // Get Roles
  const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  const guardRole = await prisma.role.findUnique({ where: { name: "GUARD" } });
  const shiftRole = await prisma.role.findUnique({ where: { name: "SHIFT" } });
  const maintRole = await prisma.role.findUnique({ where: { name: "MAINT" } });

  if (!adminRole || !guardRole || !shiftRole  || !maintRole) {
    hackerLog.error('SECURITY', 'Roles not found, check catalogs first');
    return;
  }

  // Get Schedules
  const matutino = await prisma.schedule.findUnique({ where: { name: "Matutino" } });
  const vespertino = await prisma.schedule.findUnique({ where: { name: "Vespertino" } });
  const nocturno = await prisma.schedule.findUnique({ where: { name: "Nocturno" } });

  // 1. ADMINS
  hackerLog.info('AUTH', 'Deploying Admin accounts');
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Admin",
      lastName: "Principal",
      username: "admin",
      password,
      roleId: adminRole.id,
      organizationId: tenant.organizationId,
    },
  });

  await prisma.user.upsert({
    where: { username: "isabel" },
    update: {},
    create: {
      name: "Isabel",
      lastName: "Admin",
      username: "isabel",
      password,
      roleId: adminRole.id,
      organizationId: tenant.organizationId,
    },
  });

  // 2. GUARDS
  hackerLog.info('AUTH', 'Deploying Guard infrastructure');
  const guardUsers = [
    { username: "victor", name: "Victor", lastName: "Guardia", scheduleId: matutino?.id },
    { username: "martin", name: "Martin", lastName: "Guardia", scheduleId: matutino?.id },
    { username: "marco", name: "Marco", lastName: "Guardia", scheduleId: vespertino?.id },
    { username: "asael", name: "Asael", lastName: "Guardia", scheduleId: nocturno?.id },
  ];

  for (const u of guardUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        name: u.name,
        lastName: u.lastName,
        username: u.username,
        password,
        roleId: guardRole.id,
        scheduleId: u.scheduleId,
        organizationId: tenant.organizationId,
      },
    });
  }

  // 3. SHIFT GUARDS
  await prisma.user.upsert({
    where: { username: "ricardo" },
    update: {},
    create: {
      name: "Ricardo",
      lastName: "Shift",
      username: "ricardo",
      password,
      roleId: shiftRole.id,
      scheduleId: vespertino?.id,
      organizationId: tenant.organizationId,
    },
  });

  // 4. MAINTENANCE
  hackerLog.info('AUTH', 'Deploying Maintenance personnel');
  await prisma.user.upsert({
    where: { username: "mario" },
    update: {},
    create: {
      name: "Mario",
      lastName: "Mantenimiento",
      username: "mario",
      password,
      roleId: maintRole.id,
      organizationId: tenant.organizationId,
    },
  });

  // Multicliente: todo el personal de demostración pertenece al cliente por defecto.
  const staff = await prisma.user.findMany({
    where: { username: { in: ["admin", "isabel", ...guardUsers.map((u) => u.username), "ricardo", "mario"] } },
    select: { id: true, role: { select: { name: true } } },
  });
  for (const user of staff) await joinClient(prisma, { id: user.id, roleName: user.role.name }, tenant);

  hackerLog.success('SECURITY', 'Security layer deployed');
};
