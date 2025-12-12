import { PrismaClient, Appointment } from "@prisma/client";

const prisma = new PrismaClient();

// ✅ GET ALL
export const get = async (): Promise<Appointment[]> => {
  return prisma.appointment.findMany({
    include: {
      schedule: true,
      mode: true,
      user: true,
      child: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

// ✅ GET BY ID
export const getById = async (id: number): Promise<Appointment | null> => {
  return prisma.appointment.findUnique({
    where: { id },
    include: { schedule: true, mode: true, user: true, child: true },
  });
};

// ✅ CREATE WITH FULL VALIDATIONS
export const create = async (data: any): Promise<Appointment> => {
  const { userId, childId, scheduleId, modeId } = data;

  // 1) validar que el horario exista
  const schedule = await prisma.daySchedule.findUnique({
    where: { id: scheduleId },
    include: { appointments: true },
  });

  if (!schedule) throw new Error("El horario no existe.");

  // 2) validar capacidad
  const taken = schedule.appointments.length;
  if (taken >= schedule.capacity) throw new Error("El horario ya está lleno.");

  // 3) validar que el modo coincida
  if (schedule.modeId !== modeId)
    throw new Error("El modo no coincide con el horario.");

  // 4) validar que el hijo exista
  const child = await prisma.child.findUnique({
    where: { id: childId },
  });

  if (!child) throw new Error("El hijo no existe.");

  // 5) validar que el hijo pertenezca al usuario
  if (child.userId !== userId)
    throw new Error("El hijo no pertenece al usuario.");

  // 6) evitar duplicar al mismo hijo en el mismo horario
  const duplicate = await prisma.appointment.findFirst({
    where: {
      scheduleId,
      childId,
    },
  });

  if (duplicate) {
    throw new Error(
      `El hijo "${child.name}" ya está registrado en este horario.`
    );
  }

  // 7) crear cita
  return prisma.appointment.create({
    data: {
      userId,
      childId,
      scheduleId,
      modeId,
    },
  });
};

// ✅ DELETE
export const remove = async (id: number): Promise<Appointment> => {
  return prisma.appointment.delete({
    where: { id },
  });
};

// ✅ FILTER: BY DATE (scheduled date)
export const getByDate = async (dateStr: string): Promise<Appointment[]> => {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  return prisma.appointment.findMany({
    where: {
      schedule: { date },
    },
    include: { schedule: true, mode: true, user: true, child: true },
    orderBy: { schedule: { startTime: "asc" } },
  });
};

// ✅ FILTER: BY SCHEDULE ID
export const getBySchedule = async (
  scheduleId: number
): Promise<Appointment[]> => {
  return prisma.appointment.findMany({
    where: { scheduleId },
    include: { schedule: true, mode: true, user: true, child: true },
  });
};

// ✅ FILTER: BY CHILD NAME (usa relación)
export const getByStudent = async (name: string): Promise<Appointment[]> => {
  return prisma.appointment.findMany({
    where: {
      child: {
        name: {
          contains: name,
        },
      },
    },
    include: { schedule: true, mode: true, user: true, child: true },
  });
};

// ✅ FILTER: BY MODE ID
export const getByMode = async (modeId: number): Promise<Appointment[]> => {
  return prisma.appointment.findMany({
    where: { modeId },
    include: { schedule: true, mode: true, user: true, child: true },
  });
};

// ✅ FILTER: BY USER ID
export const getByUser = async (userId: number): Promise<Appointment[]> => {
  return prisma.appointment.findMany({
    where: { userId },
    include: { schedule: true, mode: true, user: true, child: true },
    orderBy: { schedule: { startTime: "asc" } },
  });
};
