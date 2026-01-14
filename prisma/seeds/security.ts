import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

export const securitySeed = async (prisma: PrismaClient) => {
  await adminSeed(prisma);
  await operatorSeed(prisma);
  await userSeed(prisma);
};

// ---------------------------
// ADMIN
// ---------------------------
const adminSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("admin123", 10);

  return prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Administrador",
      lastName: "Principal",
      username: "admin",
      password,
      role: Role.ADMIN,
    },

  });
};

// ---------------------------
// OPERATOR
// ---------------------------
const operatorSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("user123", 10);

  return prisma.user.upsert({
    where: { username: "guard1" },
    update: {},
    create: {
      name: "Guardia",
      lastName: "Turno 1",
      username: "guard1",
      password,
      role: Role.SHIFT_GUARD,
      shiftStart: "08:00",
      shiftEnd: "16:00"
    },
  });
};

// ---------------------------
// USER (CLIENTE EJEMPLO)
// ---------------------------
const userSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("user123", 10);

  return prisma.user.upsert({
    where: { username: "guard2" },
    update: {},
    create: {
      name: "Guardia",
      lastName: "Prueba",
      username: "guard2",
      password,
      role: Role.GUARD,
    },
  });
};
