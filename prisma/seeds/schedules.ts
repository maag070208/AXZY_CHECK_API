import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

export const schedulesSeed = async (prisma: PrismaClient) => {
  hackerLog.info('SCHEDULE', 'Configuring Operational timelines');
  const schedules = [
    {
      name: "Matutino",
      startTime: "07:00",
      endTime: "15:00",
    },
    {
      name: "Vespertino",
      startTime: "15:00",
      endTime: "23:00",
    },
    {
      name: "Nocturno",
      startTime: "23:00",
      endTime: "07:00",
    },
  ];

  for (const schedule of schedules) {
    await prisma.schedule.upsert({
      where: { name: schedule.name },
      update: {},
      create: schedule,
    });
  }
  hackerLog.success('SCHEDULE', 'Time intervals synchronized');
};
