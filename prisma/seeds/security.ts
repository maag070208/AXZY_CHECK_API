import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hackerLog } from "./logger";

export const securitySeed = async (prisma: PrismaClient) => {
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
    update: { roleId: adminRole.id },
    create: {
      name: "Admin",
      lastName: "Principal",
      username: "admin",
      password,
      roleId: adminRole.id,
    },
  });

  await prisma.user.upsert({
    where: { username: "isabel" },
    update: { roleId: adminRole.id },
    create: {
      name: "Isabel",
      lastName: "Admin",
      username: "isabel",
      password,
      roleId: adminRole.id,
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
      update: { scheduleId: u.scheduleId, roleId: guardRole.id },
      create: {
        name: u.name,
        lastName: u.lastName,
        username: u.username,
        password,
        roleId: guardRole.id,
        scheduleId: u.scheduleId,
      },
    });
  }

  // 3. SHIFT GUARDS
  await prisma.user.upsert({
    where: { username: "ricardo" },
    update: { scheduleId: vespertino?.id, roleId: shiftRole.id },
    create: {
      name: "Ricardo",
      lastName: "Shift",
      username: "ricardo",
      password,
      roleId: shiftRole.id,
      scheduleId: vespertino?.id,
    },
  });

  // 4. MAINTENANCE
  hackerLog.info('AUTH', 'Deploying Maintenance personnel');
  await prisma.user.upsert({
    where: { username: "mario" },
    update: { roleId: maintRole.id },
    create: {
      name: "Mario",
      lastName: "Mantenimiento",
      username: "mario",
      password,
      roleId: maintRole.id,
    },
  });

  hackerLog.success('SECURITY', 'Security layer deployed');
};
