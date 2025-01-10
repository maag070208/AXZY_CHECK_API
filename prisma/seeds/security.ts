import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const securitySeed = async (prisma: PrismaClient) => {
  await adminSeed(prisma);
  await clientSeed(prisma);
  await userSeed(prisma);
};

const adminSeed = async (prisma: PrismaClient) => {
  const adminPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "maag070208@gmail.com" },
    update: {
      password: adminPassword,
    },
    create: {
      name: "Admin",
      lastName: "admin",
      email: "maag070208@gmail.com",
      password: adminPassword,
      role: "ADMIN",
    },
  });
};

const userSeed = async (prisma: PrismaClient) => {
  const userPassword = await bcrypt.hash("user123", 10);

  await prisma.user.upsert({
    where: { email: "asael070208@gmail.com" },
    update: {
      password: userPassword,
    },
    create: {
      name: "User",
      lastName: "user",
      email: "asael070208@gmail.com",
      password: userPassword,
      role: "USER",
    },
  });
};

const clientSeed = async (prisma: PrismaClient) => {
  await prisma.client.upsert({
    where: { rfc: "AAGM020708EL5" },
    update: {
      name: "Martin Amaro",
    },
    create: {
      name: "Martin Amaro",
      email: "maag070208@gmail.com",
      phoneNumber: "6645102632",
      rfc: "AAGM020708EL5",
    },
  });
};
