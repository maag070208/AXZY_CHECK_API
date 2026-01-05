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
    where: { email: "admin@park.com" },
    update: {},
    create: {
      name: "Administrador",
      lastName: "Principal",
      email: "admin@park.com",
      password,
      role: Role.ADMIN,
    },
  });
};

// ---------------------------
// OPERATOR
// ---------------------------
const operatorSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("operator123", 10);

  return prisma.user.upsert({
    where: { email: "operator@park.com" },
    update: {},
    create: {
      name: "Operador",
      lastName: "Turno 1",
      email: "operator@park.com",
      password,
      role: Role.OPERATOR,
    },
  });
};

// ---------------------------
// USER (CLIENTE EJEMPLO)
// ---------------------------
const userSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("user123", 10);

  return prisma.user.upsert({
    where: { email: "cliente@park.com" },
    update: {},
    create: {
      name: "Cliente",
      lastName: "Prueba",
      email: "cliente@park.com",
      password,
      role: Role.USER,
    },
  });
};
