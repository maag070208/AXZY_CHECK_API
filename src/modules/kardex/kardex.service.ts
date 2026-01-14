import { prismaClient } from "@src/core/config/database";


export const createKardex = async (data: {
  userId: number;
  locationId: number;
  notes?: string;
  media?: any[]; // Array of { type: 'IMAGE' | 'VIDEO', url: 'string' }
}) => {
  return prismaClient.kardex.create({
    data,
  });
};

export const updateKardex = async (
  id: number,
  data: {
    notes?: string;
    media?: any[];
  }
) => {
  return prismaClient.kardex.update({
    where: { id },
    data,
  });
};

export const getKardex = async (filters: {
  userId?: number;
  locationId?: number;
  startDate?: string;
  endDate?: string;
}) => {
  const where: any = {};

  if (filters.userId) where.userId = Number(filters.userId);
  if (filters.locationId) where.locationId = Number(filters.locationId);

  if (filters.startDate && filters.endDate) {
    where.timestamp = {
      gte: new Date(filters.startDate),
      lte: new Date(filters.endDate),
    };
  }

  return prismaClient.kardex.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, lastName: true, username: true, role: true },
      },
      location: true,
    },
    orderBy: {
      timestamp: "desc",
    },
  });
};

export const getKardexById = async (id: number) => {
  return prismaClient.kardex.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, lastName: true, username: true, role: true },
      },
      location: true,
    },
  });
};
