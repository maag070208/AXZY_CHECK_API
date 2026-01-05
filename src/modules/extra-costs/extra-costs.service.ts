import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createExtraCost = async (data: {
  entryId: number;
  userId: number;
  operatorId: number;
  reason: string;
  amount: number;
  imageUrl?: string;
}) => {
  return await prisma.extraCost.create({
    data: {
      entryId: data.entryId,
      userId: data.userId,
      operatorId: data.operatorId,
      reason: data.reason,
      amount: data.amount,
      imageUrl: data.imageUrl,
    }
  });
};

export const getExtraCostsByEntry = async (entryId: number) => {
  return await prisma.extraCost.findMany({
    where: { entryId },
    orderBy: { createdAt: 'desc' },
    include: {
        operator: true // To show who applied it
    }
  });
};
