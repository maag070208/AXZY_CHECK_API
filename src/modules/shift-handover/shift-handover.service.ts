import { prismaClient } from "@src/core/config/database";
import { getSetting } from "@src/core/settings/app-settings.service";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { ABLY_CHANNELS, publishToChannel } from "@src/core/config/ably";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";
import { operativeStaffWhere } from "@src/core/scope/membership";
import { AppError } from "@src/core/errors/app-error";
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
  createdBy: { select: { id: true, name: true, lastName: true, photoUrl: true } },
  elements: {
    include: { guard: { select: { id: true, name: true, lastName: true } } },
  },
} as const;

/**
 * @description Creates a shift-handover report together with its per-guard
 * elements in a single Prisma transaction, then returns the full detail.
 * Multicliente: la entrega pertenece al cliente del alcance (sin cliente → 403) y el único
 * por turno+fecha es por cliente.
 */
export const createShiftHandover = async (data: CreateShiftHandoverInput, scope: ClientScope | undefined) => {
  const { clientId } = scopeByClient(scope);

  // Los guardias del reporte tienen que ser personal operativo de ese cliente: una entrega no puede
  // mencionar a alguien de otro cliente (el detalle muestra su nombre).
  const guardIds = [...new Set(data.elements.map((element) => element.guardId))];
  if (guardIds.length > 0) {
    const valid = await prismaClient.user.findMany({
      where: { id: { in: guardIds }, ...operativeStaffWhere(scope) },
      select: { id: true },
    });
    if (valid.length !== guardIds.length) {
      throw new AppError("GUARD_INVALID", "Algún guardia indicado no pertenece a este cliente", 400);
    }
  }

  return prismaClient.$transaction(async (tx) => {
    const handover = await tx.shiftHandover.create({
      data: {
        clientId,
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
  }).then((result) => {
    // Live dashboard (Home de WEB): al entregarse el turno, la alerta de
    // "entrega pendiente" debe desaparecer sin esperar al polling.
    publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, 'refresh', { reason: 'shift-handover-created' });
    return result;
  });
};

/** @description Paginated list for the WEB admin `ITDataTable`, solo del cliente del alcance. */
export const getDataTableShiftHandovers = async (
  params: ITDataTableFetchParams,
  scope: ClientScope | undefined,
): Promise<ITDataTableResponse<any>> => {
  // Sin cliente en el alcance es 403, no una tabla vacía.
  const prismaParams = getPrismaPaginationParams(params);
  const where = { ...(prismaParams.where ?? {}), ...scopeByClient(scope) };
  const findParams = { ...prismaParams, where };

  const [rows, total] = await Promise.all([
    prismaClient.shiftHandover.findMany({
      ...findParams,
      include: {
        createdBy: { select: { id: true, name: true, lastName: true, photoUrl: true } },
        _count: { select: { elements: true } },
      },
      orderBy: prismaParams.orderBy || { handoverDate: "desc" },
    }),
    prismaClient.shiftHandover.count({ where }),
  ]);

  return { rows, total };
};

/** @description Full detail (checklist + elements + author) for one report; de otro cliente → null (404). */
export const getShiftHandoverById = async (id: number, scope: ClientScope | undefined) => {
  return prismaClient.shiftHandover.findFirst({ where: { id, ...scopeByClient(scope) }, include: detailInclude });
};

/**
 * @description Determines whether the current shift's handover report is
 * "pending": the configured alert time for the relevant shift has already
 * passed today (in the configured timezone) and no `ShiftHandover` row
 * exists yet for that shift/date in the client of the request scope.
 * Consumed by the APP banner, the dashboard alert and by polling as a
 * fallback to the Ably live alert.
 */
export const getPendingShiftHandover = async (scope: ClientScope | undefined) => {
  const { clientId } = scopeByClient(scope);
  const timezoneConfig = await getSetting("app.timezone", "UTC");
  const morningTime = await getSetting("SHIFT_ALERT_MORNING_TIME", "07:00");
  const eveningTime = await getSetting("SHIFT_ALERT_EVENING_TIME", "19:00");

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

  const existing = await prismaClient.shiftHandover.findFirst({
    where: { clientId, shiftType: dueShiftType, handoverDate: new Date(`${today}T00:00:00.000Z`) },
  });

  return { pending: !existing, shiftType: dueShiftType, date: today };
};
