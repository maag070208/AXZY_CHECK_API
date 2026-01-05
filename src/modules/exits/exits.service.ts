import { PrismaClient, ExitStatus, EntryStatus } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllExits = async () => {
  return await prisma.vehicleExit.findMany({
    include: {
      entry: {
        include: {
            user: true
        }
      },
      operator: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

export const createExit = async (data: {
  entryId: number;
  operatorUserId: number;
  notes?: string;
}) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Get Entry
    const entry = await tx.vehicleEntry.findUnique({
       where: { id: data.entryId }
    });
    if (!entry) throw new Error("Entry not found");

    // 2. Create Exit
    const exit = await tx.vehicleExit.create({
      data: {
        entryId: data.entryId,
        operatorUserId: data.operatorUserId,
        status: ExitStatus.DELIVERED, // Assuming immediate delivery
        notes: data.notes,
      },
    });

    // 3. Update Entry Status
    await tx.vehicleEntry.update({
      where: { id: data.entryId },
      data: {
        status: EntryStatus.EXITED,
      },
    });

    // 4. Free Location
    await tx.location.update({
        where: { id: entry.locationId },
        data: { isOccupied: false }
    });

    return exit;
  });
};
