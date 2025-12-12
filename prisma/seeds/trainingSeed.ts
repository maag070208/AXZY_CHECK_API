import { PrismaClient } from "@prisma/client";

export const trainingSeed = async (prisma: PrismaClient) => {
  await trainingModeSeed(prisma);
  await scheduleSeed(prisma);
};

// ---------------------------
//  SEED: TRAINING MODES
// ---------------------------
const trainingModeSeed = async (prisma: PrismaClient) => {
  const modes = [
    { name: "Bateo", description: "Entrenamiento de bateo" },
    { name: "Pitcher", description: "Entrenamiento especializado para pitchers" },
    { name: "Catcher", description: "Entrenamiento especializado para catchers" },
    { name: "Funcional", description: "Entrenamiento funcional y físico" },
    { name: "General", description: "Entrenamiento general" },
  ];

  for (const mode of modes) {
    await prisma.trainingMode.upsert({
      where: { name: mode.name },
      update: {},
      create: mode,
    });
  }
};

// ---------------------------
//  SEED: SCHEDULES
// ---------------------------
const scheduleSeed = async (prisma: PrismaClient) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const modes = await prisma.trainingMode.findMany();
  const findMode = (name: string) =>
    modes.find((m) => m.name === name)?.id || 1;

  const schedules = [
    {
      date: today,
      startTime: buildTime(16, 0),
      endTime: buildTime(17, 0),
      capacity: 10,
      modeId: findMode("General"),
    },
    {
      date: today,
      startTime: buildTime(17, 0),
      endTime: buildTime(18, 0),
      capacity: 10,
      modeId: findMode("General"),
    },
    {
      date: today,
      startTime: buildTime(18, 0),
      endTime: buildTime(19, 0),
      capacity: 0,
      modeId: findMode("General"),
    },
    {
      date: today,
      startTime: buildTime(19, 0),
      endTime: buildTime(20, 0),
      capacity: 10,
      modeId: findMode("General"),
    },
    {
      date: today,
      startTime: buildTime(20, 0),
      endTime: buildTime(21, 0),
      capacity: 6,
      modeId: findMode("Bateo"),
    },
  ];

  for (const schedule of schedules) {
    await prisma.daySchedule.upsert({
      where: {
        date_startTime_endTime: {
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
        },
      },
      update: {},
      create: schedule,
    });
  }
};

const buildTime = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
