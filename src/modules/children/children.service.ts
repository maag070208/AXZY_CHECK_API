import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const getByUser = (userId: number) => {
  return prisma.child.findMany({
    where: { userId },
    include: { appointments: true },
    orderBy: { id: "asc" },
  });
};

export const create = (data: any) => {
  return prisma.child.create({
    data: {
      name: data.name,
      lastName: data.lastName ?? "",
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      userId: data.userId,
    },
  });
};

export const remove = (id: number) => {
  return prisma.child.delete({
    where: { id },
  });
};

export const getAll = () => {
  return prisma.child.findMany({
    orderBy: { name: "asc" },
  });
};

export const getById = (id: number) => {
  return prisma.child.findUnique({
    where: { id },
  });
};

export const update = (id: number, data: any) => {
  return prisma.child.update({
    where: { id },
    data: {
      name: data.name,
      lastName: data.lastName,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
    },
  });
};
