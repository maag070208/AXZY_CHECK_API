import { PrismaClient } from "@prisma/client";
import { StaffIds } from "./staff";

export interface OperationsIds {
  shiftHandoverId: number;
  uniformCheckId: number;
  chatMessageId: number;
}

/**
 * Flujo "operación de turno": una entrega de turno con un guardia puntual, una revisión de
 * uniforme y un mensaje de chat. Idempotente (la entrega es única por turno y fecha).
 */
export const operationsFlow = async (prisma: PrismaClient, staff: StaffIds): Promise<OperationsIds> => {
  const handoverDate = new Date("2026-01-15T00:00:00.000Z");
  const handover =
    (await prisma.shiftHandover.findUnique({ where: { shiftType_handoverDate: { shiftType: "MATUTINO", handoverDate } } })) ??
    (await prisma.shiftHandover.create({
      data: {
        shiftType: "MATUTINO", handoverDate, credentialsCount: 3, tarjetonesCount: 12, novedades: "Sin novedades relevantes",
        checklistPhones: true, checklistTablet: true, checklistRadios: true, checklistKeys: true, checklistLogbook: true, checklistConsignas: true,
        reportedToAdmin: true, createdById: staff.shift,
        elements: { create: [{ guardId: staff.guard1, entryTime: "06:55", punctual: true }] },
      },
    }));

  const uniform =
    (await prisma.uniformCheck.findFirst({ where: { guardId: staff.guard1, notes: "Flujo · uniforme completo" } })) ??
    (await prisma.uniformCheck.create({
      data: {
        guardId: staff.guard1, evaluatedById: staff.shift, notes: "Flujo · uniforme completo",
        pantalon: true, botas: true, cinturon: true, camisa: true, pluma: true, gorra: true,
        unas: true, orejas: true, desodorante: true, afeitado: true, peinado: true,
      },
    }));

  const chat =
    (await prisma.chatMessage.findFirst({ where: { userId: staff.guard1, message: "Flujo · inicio de turno" } })) ??
    (await prisma.chatMessage.create({ data: { userId: staff.guard1, message: "Flujo · inicio de turno" } }));

  return { shiftHandoverId: handover.id, uniformCheckId: uniform.id, chatMessageId: chat.id };
};
