import { PrismaClient, TrainingMode } from "@prisma/client";

const prisma = new PrismaClient();

export const get = async (): Promise<TrainingMode[]> => {
  return prisma.trainingMode.findMany({
    orderBy: { id: "asc" },
  });
};

export const getById = async (id: number): Promise<TrainingMode | null> => {
  return prisma.trainingMode.findUnique({
    where: { id },
  });
};

export const create = async (data: any): Promise<TrainingMode> => {
  return prisma.trainingMode.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      isActive: data.isActive ?? true,
    },
  });
};

export const update = async (
  id: number,
  data: any
): Promise<TrainingMode> => {
  return prisma.trainingMode.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description ?? null,
      isActive: data.isActive ?? true,
    },
  });
};

export const remove = async (id: number): Promise<TrainingMode> => {
  return prisma.trainingMode.delete({
    where: { id },
  });
};
