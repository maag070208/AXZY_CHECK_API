import { prismaClient } from "@src/core/config/database";

export const getUsers = async () => {
  return prismaClient.user.findMany();
};

export const getUserByEmail = async (email: string) => {
  return prismaClient.user.findFirst({
    where: {
      email,
    },
  });
};

export const addUser = async (data: any) => {
  return prismaClient.user.create({
    data,
  });
};

export const updateUser = async (id: number, data: any) => {
  return prismaClient.user.update({
    where: {
      id,
    },
    data,
  });
};

export const deleteUser = async (id: number) => {
  return prismaClient.user.delete({
    where: {
      id,
    },
  });
};

