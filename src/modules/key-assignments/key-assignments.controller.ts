import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createTResult } from "@src/core/mappers/tresult.mapper";

const prisma = new PrismaClient();

// CREATE ASSIGNMENT
export const createAssignment = async (req: Request, res: Response) => {
  try {
    const { entryId, operatorId, type, targetLocationId } = req.body;

    if (!entryId || !operatorId || !type) {
        return res.status(400).json(createTResult(null, ["Missing required fields"]));
    }

    if (type === "MOVEMENT" && !targetLocationId) {
        return res.status(400).json(createTResult(null, ["Target location is required for MOVEMENT assignments"]));
    }

    // Check if entry already has an active assignment
    const activeAssignment = await prisma.keyAssignment.findFirst({
        where: {
            entryId: Number(entryId),
            status: "ACTIVE"
        }
    });

    if (activeAssignment) {
        return res.status(400).json(createTResult(null, ["Entry already has an active key assignment"]));
    }

    const assignment = await prisma.keyAssignment.create({
      data: {
        entryId: Number(entryId),
        operatorUserId: Number(operatorId),
        type: type, // MOVEMENT or DELIVERY
        status: "ACTIVE",
        targetLocationId: targetLocationId ? Number(targetLocationId) : null
      },
    });

    res.json(createTResult(assignment));
  } catch (error: any) {
    console.error(error);
    res.status(500).json(createTResult(null, error.message));
  }
};

// FINISH ASSIGNMENT
export const finishAssignment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const assignment = await prisma.keyAssignment.findUnique({
        where: { id: Number(id) },
        include: { entry: true }
    });

    if (!assignment) {
        return res.status(404).json(createTResult(null, ["Assignment not found"]));
    }

    if (assignment.status !== "ACTIVE") {
        return res.status(400).json(createTResult(null, ["Assignment is not active"]));
    }

    let updated;

    if (assignment.type === "DELIVERY") {
        // Transaction to finish assignment, mark entry as exited, free location, AND create exit record
        const [assignmentUpdated] = await prisma.$transaction([
            prisma.keyAssignment.update({
                where: { id: Number(id) },
                data: {
                    status: "COMPLETED",
                    endedAt: new Date()
                }
            }),
            prisma.vehicleEntry.update({
                where: { id: assignment.entryId },
                data: { status: "EXITED" }
            }),
            prisma.location.update({
                where: { id: assignment.entry.locationId },
                data: { isOccupied: false }
            }),
            prisma.vehicleExit.create({
                data: {
                    entryId: assignment.entryId,
                    operatorUserId: assignment.operatorUserId,
                    status: "DELIVERED",
                    notes: "Salida automática por entrega de llaves"
                }
            })
        ]);
        updated = assignmentUpdated;
    } else {
        // Finish assignment for MOVEMENT and UPDATE LOCATION
        if (!assignment.targetLocationId) {
             return res.status(400).json(createTResult(null, ["Target location not found in assignment"]));
        }

        const [assignmentUpdated] = await prisma.$transaction([
            // 1. Complete Assignment
            prisma.keyAssignment.update({
                where: { id: Number(id) },
                data: {
                    status: "COMPLETED",
                    endedAt: new Date()
                }
            }),
            // 2. Update Entry Location
            prisma.vehicleEntry.update({
                where: { id: assignment.entryId },
                data: { 
                    locationId: assignment.targetLocationId,
                    status: "MOVED" // Or ACTIVE effectively
                }
            }),
            // 3. Free Old Location
            prisma.location.update({
                where: { id: assignment.entry.locationId },
                data: { isOccupied: false }
            }),
            // 4. Occupy New Location
            prisma.location.update({
                where: { id: assignment.targetLocationId },
                data: { isOccupied: true }
            }),
            // 5. Create Movement Record
            prisma.vehicleMovement.create({
                data: {
                    entryId: assignment.entryId,
                    fromLocationId: assignment.entry.locationId,
                    toLocationId: assignment.targetLocationId,
                    assignedUserId: assignment.operatorUserId, // Operator calling this
                    status: "COMPLETED",
                    completedAt: new Date()
                }
            })
        ]);
        updated = assignmentUpdated;
    }

    res.json(createTResult(updated));
  } catch (error: any) {
    console.error(error);
    res.status(500).json(createTResult(null, error.message));
  }
};
// GET ALL ASSIGNMENTS
export const getAssignments = async (req: Request, res: Response) => {
  try {
    const assignments = await prisma.keyAssignment.findMany({
      include: {
        entry: {
            include: {
                location: true,
                movements: { // Include movements to track history
                    include: {
                        fromLocation: true, // we need the name of the previous location
                        toLocation: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        },
        operator: true,
        targetLocation: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(createTResult(assignments));
  } catch (error: any) {
    console.error(error);
    res.status(500).json(createTResult(null, error.message));
  }
};
