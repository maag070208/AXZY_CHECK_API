import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllLocations = async () => {
  return await prisma.location.findMany({
    where: { softDelete: false },
    orderBy: { name: "asc" },
    include: {
        entries: {
            where: {
                status: {
                    notIn: ["EXITED", "CANCELLED"]
                }
            },
            include: {
                user: true,
                photos: true
            }
        }
    }
  });
};

export const createLocation = async (data: {
  aisle: string;
  spot: string;
  name?: string;
}) => {
  const name = data.name || `${data.aisle}-${data.spot}`;
  return await prisma.location.create({
    data: {
      aisle: data.aisle,
      spot: data.spot,
      name,
    },
  });
};

export const updateLocation = async (id: number, data: { aisle: string; spot: string; name: string }) => {
    return await prisma.location.update({
        where: { id },
        data
    });
};

export const deleteLocation = async (id: number) => {
    const location = await prisma.location.findUnique({
        where: { id },
        include: {
            entries: {
                where: {
                    status: {
                        notIn: ["EXITED", "CANCELLED"]
                    }
                }
            }
        }
    });

    if (!location) throw new Error("Location not found");

    if (location.entries.length > 0) {
        throw new Error("No se puede eliminar una zona con vehículos activos.");
    }

    return await prisma.location.update({
        where: { id },
        data: { softDelete: true }
    });
};

export const getAvailableLocation = async () => {
    // Return all active zones (shared logic)
  return await prisma.location.findFirst({
    where: { active: true, softDelete: false },
  });
};
