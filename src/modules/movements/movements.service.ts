import { PrismaClient, MovementStatus, EntryStatus } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllMovements = async () => {
  return await prisma.vehicleMovement.findMany({
    include: {
      entry: true,
      assignedUser: true
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getKardex = async () => {
    // 1. Fetch Entries (Created)
    const entries = await prisma.vehicleEntry.findMany({
        include: { user: true, operator: true, location: true }
    });

    // 2. Fetch Exits
    const exits = await prisma.vehicleExit.findMany({
        include: { entry: true, operator: true }
    });

    // 3. Fetch Movements
    const movements = await prisma.vehicleMovement.findMany({
        include: { entry: true, assignedUser: true }
    });

    // 4. Fetch Key Assignments
    const keys = await prisma.keyAssignment.findMany({
        include: { entry: true, operator: true, targetLocation: true }
    });

    // 5. Map to unified structure
    const timeline: any[] = [];

    entries.forEach(e => {
        timeline.push({
            id: `ENTRY-${e.id}`,
            date: e.entryDate,
            type: 'INGRESO',
            description: `Ingreso de vehículo en ${e.location?.name}`,
            plates: e.plates,
            entryNumber: e.entryNumber,
            clientName: `${e.user?.name} ${e.user?.lastName}`,
            operatorName: `${e.operator?.name} ${e.operator?.lastName}`,
            status: e.status
        });
    });

    exits.forEach(e => {
        timeline.push({
            id: `EXIT-${e.id}`,
            date: e.exitDate,
            type: 'SALIDA',
            description: `Salida de vehículo. ${e.notes || ''}`,
            plates: e.entry?.plates,
            entryNumber: e.entry?.entryNumber,
            clientName: 'N/A', // Exit usually recorded by operator, client implied by entry lookup
            operatorName: `${e.operator?.name} ${e.operator?.lastName}`,
            status: e.status
        });
    });

    movements.forEach(m => {
        timeline.push({
            id: `MOVE-${m.id}`,
            date: m.createdAt,
            type: 'MOVIMIENTO',
            description: `Movimiento interno ver detalle`,
            plates: m.entry?.plates,
            entryNumber: m.entry?.entryNumber,
            clientName: 'N/A',
            operatorName: `${m.assignedUser?.name} ${m.assignedUser?.lastName}`,
            status: m.status
        });
    });

    keys.forEach(k => {
        const typeLabel = k.type === 'DELIVERY' ? 'ENTREGA' : 'MOVIMIENTO';
        timeline.push({
            id: `KEY-${k.id}`,
            date: k.createdAt,
            type: 'LLAVES',
            description: `Asignación de llave para ${typeLabel}`,
            plates: k.entry?.plates,
            entryNumber: k.entry?.entryNumber,
            clientName: 'N/A',
            operatorName: `${k.operator?.name} ${k.operator?.lastName}`,
            status: k.status
        });
        
        if (k.endedAt) {
             timeline.push({
                id: `KEY-END-${k.id}`,
                date: k.endedAt,
                type: 'LLAVES_FIN',
                description: `Fin de asignación de llave (${typeLabel})`,
                plates: k.entry?.plates,
                entryNumber: k.entry?.entryNumber,
                clientName: 'N/A',
                operatorName: `${k.operator?.name} ${k.operator?.lastName}`,
                status: 'COMPLETED'
            });
        }
    });

    // Sort by Date Descending
    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const createMovement = async (data: {
  entryId: number;
  toLocationId: number;
  assignedUserId: number;
}) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Get current entry location
    const entry = await tx.vehicleEntry.findUnique({
      where: { id: data.entryId },
    });

    if (!entry) throw new Error("Entry not found");

    // 2. Create Movement
    const movement = await tx.vehicleMovement.create({
      data: {
        entryId: data.entryId,
        fromLocationId: entry.locationId,
        toLocationId: data.toLocationId,
        assignedUserId: data.assignedUserId,
        status: MovementStatus.COMPLETED, // Auto-completing for now/simplicity, as usually it is instant in API
        completedAt: new Date(),
      },
    });

    // 3. Update Entry Location and Status
    await tx.vehicleEntry.update({
      where: { id: data.entryId },
      data: {
        locationId: data.toLocationId,
        status: EntryStatus.MOVED,
      },
    });

    // 4. Update Old Location (Free)
    await tx.location.update({
        where: { id: entry.locationId },
        data: { isOccupied: false }
    });

    // 5. Update New Location (Occupied)
    await tx.location.update({
        where: { id: data.toLocationId },
        data: { isOccupied: true }
    });

    return movement;
  });
};
