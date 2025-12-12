import { PrismaClient, DaySchedule } from "@prisma/client";
import { startOfWeek, endOfWeek } from "date-fns";

const prisma = new PrismaClient();

////////////////////////////////////////////////////////////////////////////////
//  ✅ CRUD BASICO
////////////////////////////////////////////////////////////////////////////////

// GET ALL
export const get = async (): Promise<DaySchedule[]> => {
  return prisma.daySchedule.findMany({
    include: { mode: true, appointments: true },
    orderBy: [
      { date: "asc" },
      { startTime: "asc" }
    ],
  });
};

// GET BY ID
export const getById = async (id: number): Promise<DaySchedule | null> => {
  return prisma.daySchedule.findUnique({
    where: { id },
    include: {
      mode: true,
      appointments: true,
    },
  });
};

// CREATE
export const create = async (data: any): Promise<DaySchedule> => {
  return prisma.daySchedule.create({
    data: {
      date: new Date(data.date),
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      capacity: data.capacity,
      modeId: data.modeId,
    },
  });
};

// UPDATE
export const update = async (id: number, data: any): Promise<DaySchedule> => {
  return prisma.daySchedule.update({
    where: { id },
    data: {
      date: data.date ? new Date(data.date) : undefined,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
      capacity: data.capacity,
      modeId: data.modeId,
    },
  });
};

// DELETE
export const remove = async (id: number): Promise<DaySchedule> => {
  return prisma.daySchedule.delete({
    where: { id },
  });
};

////////////////////////////////////////////////////////////////////////////////
// ✅ FILTROS AVANZADOS
////////////////////////////////////////////////////////////////////////////////

// GET BY SPECIFIC DATE (yyyy-mm-dd)
export const getByDate = async (dateStr: string): Promise<DaySchedule[]> => {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  return prisma.daySchedule.findMany({
    where: { date },
    include: { mode: true },
    orderBy: { startTime: "asc" },
  });
};

// GET BY MODE
export const getByMode = async (modeId: number): Promise<DaySchedule[]> => {
  return prisma.daySchedule.findMany({
    where: { modeId },
    include: { mode: true },
    orderBy: [
      { date: "asc" },
      { startTime: "asc" },
    ],
  });
};

// GET TODAY
export const getToday = async (): Promise<DaySchedule[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.daySchedule.findMany({
    where: { date: today },
    include: { mode: true },
    orderBy: { startTime: "asc" },
  });
};

// GET CURRENT WEEK (Mon-Sun)
export const getWeek = async (): Promise<DaySchedule[]> => {
  const now = new Date();

  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  return prisma.daySchedule.findMany({
    where: {
      date: {
        gte: new Date(weekStart),
        lte: new Date(weekEnd),
      },
    },
    include: { mode: true },
    orderBy: [
      { date: "asc" },
      { startTime: "asc" },
    ],
  });
};

// GET SCHEDULES WITH AVAILABLE SPOTS
export const getAvailable = async (): Promise<any[]> => {
  const schedules = await prisma.daySchedule.findMany({
    include: {
      mode: true,
      appointments: true,
    },
    orderBy: [
      { date: "asc" },
      { startTime: "asc" },
    ],
  });

  return schedules
    .map(s => ({
      ...s,
      available: s.capacity - s.appointments.length,
    }))
    .filter(s => s.available > 0);
};
