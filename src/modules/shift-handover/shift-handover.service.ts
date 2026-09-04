import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface ShiftHandoverElementInput {
  guardId: number;
  entryTime: string;
  punctual?: boolean;
  observations?: string;
}

export interface CreateShiftHandoverInput {
  shiftType: "MATUTINO" | "NOCTURNO";
  handoverDate: string; // "YYYY-MM-DD"
  credentialsCount?: number;
  tarjetonesCount?: number;
  novedades?: string;
  checklistPhones: boolean;
  checklistTablet: boolean;
  checklistRadios: boolean;
  checklistKeys: boolean;
  checklistLogbook: boolean;
  checklistConsignas: boolean;
  reportedToAdmin: boolean;
  createdById: number;
  elements: ShiftHandoverElementInput[];
}

const detailInclude = {
  createdBy: { select: { id: true, name: true, lastName: true } },
  elements: {
    include: { guard: { select: { id: true, name: true, lastName: true } } },
  },
} as const;

/**
 * @description Creates a shift-handover report together with its per-guard
 * elements in a single Prisma transaction, then returns the full detail.
 */
export const createShiftHandover = async (data: CreateShiftHandoverInput) => {
  return prismaClient.$transaction(async (tx) => {
    const handover = await tx.shiftHandover.create({
      data: {
        shiftType: data.shiftType,
        handoverDate: new Date(`${data.handoverDate}T00:00:00.000Z`),
        credentialsCount: data.credentialsCount,
        tarjetonesCount: data.tarjetonesCount,
        novedades: data.novedades,
        checklistPhones: data.checklistPhones,
        checklistTablet: data.checklistTablet,
        checklistRadios: data.checklistRadios,
        checklistKeys: data.checklistKeys,
        checklistLogbook: data.checklistLogbook,
        checklistConsignas: data.checklistConsignas,
        reportedToAdmin: data.reportedToAdmin,
        createdById: data.createdById,
      },
    });

    if (data.elements.length > 0) {
      await tx.shiftHandoverElement.createMany({
        data: data.elements.map((el) => ({
          shiftHandoverId: handover.id,
          guardId: el.guardId,
          entryTime: el.entryTime,
          punctual: el.punctual ?? true,
          observations: el.observations,
        })),
      });
    }

    return tx.shiftHandover.findUnique({ where: { id: handover.id }, include: detailInclude });
  });
};

/** @description Paginated list for the WEB admin `ITDataTable`. */
export const getDataTableShiftHandovers = async (
  params: ITDataTableFetchParams,
): Promise<ITDataTableResponse<any>> => {
  const prismaParams = getPrismaPaginationParams(params);

  const [rows, total] = await Promise.all([
    prismaClient.shiftHandover.findMany({
      ...prismaParams,
      include: {
        createdBy: { select: { id: true, name: true, lastName: true } },
        _count: { select: { elements: true } },
      },
      orderBy: prismaParams.orderBy || { handoverDate: "desc" },
    }),
    prismaClient.shiftHandover.count({ where: prismaParams.where }),
  ]);

  return { rows, total };
};

/** @description Full detail (checklist + elements + author) for one report. */
export const getShiftHandoverById = async (id: number) => {
  return prismaClient.shiftHandover.findUnique({ where: { id }, include: detailInclude });
};

/** @description Reads a `SysConfig` value, falling back to a default if unset. */
export const getSysConfig = async (key: string, fallback: string) => {
  const row = await prismaClient.sysConfig.findUnique({ where: { key } });
  return row?.value ?? fallback;
};

/**
 * @description Determines whether the current shift's handover report is
 * "pending": the configured alert time for the relevant shift has already
 * passed today (in the configured timezone) and no `ShiftHandover` row
 * exists yet for that shift/date. Consumed by the APP banner and by polling
 * as a fallback to the Ably live alert.
 */
export const getPendingShiftHandover = async () => {
  const timezoneConfig = await getSysConfig("SHIFT_ALERT_TIMEZONE", "America/Tijuana");
  const morningTime = await getSysConfig("SHIFT_ALERT_MORNING_TIME", "07:00");
  const eveningTime = await getSysConfig("SHIFT_ALERT_EVENING_TIME", "19:00");

  const now = dayjs().tz(timezoneConfig);
  const today = now.format("YYYY-MM-DD");
  const [morningHour, morningMinute] = morningTime.split(":").map(Number);
  const [eveningHour, eveningMinute] = eveningTime.split(":").map(Number);

  const morningThreshold = now.hour(morningHour).minute(morningMinute).second(0);
  const eveningThreshold = now.hour(eveningHour).minute(eveningMinute).second(0);

  // 07:00 alert -> the NOCTURNO shift (night shift that just ended) report is due.
  // 19:00 alert -> the MATUTINO shift (day shift that just ended) report is due.
  let dueShiftType: "MATUTINO" | "NOCTURNO" | null = null;
  if (now.isAfter(eveningThreshold)) {
    dueShiftType = "MATUTINO";
  } else if (now.isAfter(morningThreshold)) {
    dueShiftType = "NOCTURNO";
  }

  if (!dueShiftType) {
    return { pending: false, shiftType: null as null | "MATUTINO" | "NOCTURNO", date: today };
  }

  const existing = await prismaClient.shiftHandover.findUnique({
    where: {
      shiftType_handoverDate: {
        shiftType: dueShiftType,
        handoverDate: new Date(`${today}T00:00:00.000Z`),
      },
    },
  });

  return { pending: !existing, shiftType: dueShiftType, date: today };
};
