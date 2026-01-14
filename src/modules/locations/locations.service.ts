import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllLocations = async () => {
  return await prisma.location.findMany({
    where: { softDelete: false },
    orderBy: { name: "asc" },
    

  });
};

export const createLocation = async (data: {
  aisle: string;
  spot: string;
  number: string;
  name?: string;
}) => {
  const name = data.name || `${data.aisle}-${data.spot}-${data.number}`;
  return await prisma.location.create({
    data: {
      aisle: data.aisle,
      spot: data.spot,
      number: data.number,
      name,
    },
  });
};

export const updateLocation = async (id: number, data: { aisle: string; spot: string; number: string; name: string }) => {
    return await prisma.location.update({
        where: { id },
        data
    });
};

export const deleteLocation = async (id: number) => {
    const location = await prisma.location.findUnique({
        where: { id },
    });

    if (!location) throw new Error("Location not found");

    return await prisma.location.delete({
        where: { id },
    });
};

export const getAvailableLocation = async () => {
    // Return all active zones (shared logic)
  return await prisma.location.findFirst({
    where: { active: true, softDelete: false },
  });
};
