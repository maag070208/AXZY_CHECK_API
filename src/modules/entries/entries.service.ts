import { PrismaClient, EntryStatus } from "@prisma/client";
import { getAvailableLocation } from "../locations/locations.service";

const prisma = new PrismaClient();

export const getAllEntries = async () => {
  return await prisma.vehicleEntry.findMany({
    where: { 
        softDelete: false,
        status: {
            notIn: [EntryStatus.EXITED, EntryStatus.CANCELLED]
        }
    },
    include: {
      location: true,
      user: true,
      operator: true,
      photos: true,
      assignments: {
        where: { status: "ACTIVE" }
      },
      extraCosts: true
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getEntryById = async (id: number) => {
  return await prisma.vehicleEntry.findUnique({
    where: { id },
    include: {
      location: true,
      user: true,
      operator: true,
      photos: true,
      movements: true,
      exit: true,
      assignments: {
        include: {
            operator: true,
            targetLocation: true
        },
        orderBy: { createdAt: 'desc' }
      },
      extraCosts: {
          include: { operator: true },
          orderBy: { createdAt: 'desc' }
      }
    },
  });
};

export const getLastEntryByUser = async (userId: number) => {
    return await prisma.vehicleEntry.findFirst({
        where: { userId, softDelete: false },
        orderBy: { createdAt: 'desc' }
    });
};

export const getUniqueVehiclesByUser = async (userId: number) => {
    // Determine unique vehicles by plates
    const vehicles = await prisma.vehicleEntry.findMany({
        where: { userId, softDelete: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
            id: true,
            entryNumber: true,
            brand: true,
            model: true,
            color: true,
            plates: true,
            photos: true
        }
    });
    return vehicles;
};

interface CreateEntryDTO {
  userId: number;
  operatorUserId: number;
  brand: string;
  model: string;
  color: string;
  plates?: string;
  mileage?: number;
  notes?: string;
  photos: { category: string; imageUrl: string; description?: string }[];
  locationId?: number;
}

export const createVehicleEntry = async (data: CreateEntryDTO) => {
  // 1. Find Location
  let location;
  
  if (data.locationId) {
      location = await prisma.location.findUnique({ where: { id: data.locationId } });
      if (!location) throw new Error("Location not found");
      // Zones are shared, so we don't check for occupation
      // if (location.isOccupied) throw new Error("Selected location is occupied");
  } else {
      location = await getAvailableLocation();
  }

  if (!location) {
    throw new Error("No parking spots available");
  }

  // 2. Transaction
  return await prisma.$transaction(async (tx) => {
    // Create Entry with temp placeholder
    const tempEntry = await tx.vehicleEntry.create({
      data: {
        entryNumber: `PENDING-${Date.now()}`,
        userId: data.userId,
        operatorUserId: data.operatorUserId,
        locationId: location.id,
        status: EntryStatus.ACTIVE,
        brand: data.brand,
        model: data.model,
        color: data.color,
        plates: data.plates || '', 
        mileage: data.mileage,
        notes: data.notes,
        photos: {
          create: data.photos.map(p => ({
              category: p.category,
              imageUrl: p.imageUrl,
              description: p.description
          })),
        },
      },
    });

    // Generate Ticket ID: [LocationName]-[ID]
    // User requested direct usage of location name (e.g. "A", "B").
    const prefix = location.name ? location.name.toUpperCase() : 'A';
    const ticketId = `${prefix}-${tempEntry.id}`;

    // Update with real Ticket ID
    const entry = await tx.vehicleEntry.update({
        where: { id: tempEntry.id },
        data: { entryNumber: ticketId },
        include: {
            location: true,
            photos: true,
        },
    });

    // Create Initial Assignment Log (History)
    await tx.keyAssignment.create({
        data: {
            entryId: entry.id,
            operatorUserId: data.operatorUserId,
            type: "MOVEMENT",
            status: "COMPLETED",
            targetLocationId: location.id,
            startedAt: new Date(),
            endedAt: new Date()
        }
    });

    return entry;
  });
};
