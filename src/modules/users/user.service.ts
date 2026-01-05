import { prismaClient } from "@src/core/config/database";

export const getUsers = async (search?: string) => {
  if (!search) {
    return prismaClient.user.findMany({
        orderBy: { name: 'asc' }
    });
  }

  return prismaClient.user.findMany({
    where: {
      OR: [
          { name: { contains: search } }, 
          { lastName: { contains: search } },
          { email: { contains: search } },
          {
              entriesCreated: {
                  some: {
                      plates: { contains: search }
                  }
              }
          }
      ]
    },
    orderBy: { name: 'asc' }
  });
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

