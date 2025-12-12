import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const securitySeed = async (prisma: PrismaClient) => {
  const admin = await adminSeed(prisma);
  const user1 = await user1Seed(prisma);
  const user2 = await user2Seed(prisma);

  await childrenSeed(prisma, user1.id, user2.id);
};

// ---------------------------
// ADMIN
// ---------------------------
const adminSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("admin123", 10);

  return prisma.user.upsert({
    where: { email: "admin@academy.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@academy.com",
      password,
      role: "ADMIN",
    },
  });
};

// ---------------------------
// USER 1
// ---------------------------
const user1Seed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("user123", 10);

  return prisma.user.upsert({
    where: { email: "user1@academy.com" },
    update: {},
    create: {
      name: "Padre Uno",
      email: "user1@academy.com",
      password,
      role: "USER",
    },
  });
};

// ---------------------------
// USER 2
// ---------------------------
const user2Seed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("user123", 10);

  return prisma.user.upsert({
    where: { email: "user2@academy.com" },
    update: {},
    create: {
      name: "Padre Dos",
      email: "user2@academy.com",
      password,
      role: "USER",
    },
  });
};

// ---------------------------
// CHILDREN
// ---------------------------
const childrenSeed = async (
  prisma: PrismaClient,
  user1Id: number,
  user2Id: number
) => {
  // User 1 → 1 hijo
  await prisma.child.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Daniel Jacobo",
      userId: user1Id,
    },
  });

  // User 2 → 2 hijos
  await prisma.child.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "Ximena Ávila",
      userId: user2Id,
    },
  });

  await prisma.child.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: "Said Martínez",
      userId: user2Id,
    },
  });
};
