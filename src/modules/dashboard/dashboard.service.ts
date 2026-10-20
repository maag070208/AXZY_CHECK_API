import { prismaClient } from "@src/core/config/database";
import { getPendingShiftHandover } from "@src/modules/shift-handover/shift-handover.service";
import { getSetting } from "@src/core/settings/app-settings.service";

/**
 * "Dashboard administrativo en vivo" — reemplaza el Home de WEB para
 * ADMIN/SHIFT. A diferencia de `reports/` (histórico, por rango de fechas),
 * esto es una sola foto del estado operativo AHORA MISMO: qué rondas están
 * en curso y su avance, quién está de turno, y qué necesita atención.
 *
 * Postgres es siempre la fuente de verdad — Ably (ver core/config/ably.ts)
 * solo avisa a los clientes que vuelvan a pedir este endpoint; si Ably
 * falla o no está configurado, el polling de respaldo en WEB lo cubre.
 */

export interface LiveDashboardAlert {
  type: "ROUND_STALLED" | "INCIDENT_OPEN" | "SHIFT_HANDOVER_OVERDUE";
  severity: "high" | "medium";
  message: string;
  refId?: number;
  /** Cuándo pasó lo que originó la alerta (para mostrar "hace X min" en WEB).
   *  Ausente cuando no hay un momento puntual que tenga sentido mostrar
   *  (p. ej. entrega de turno pendiente, que se evalúa en cada request). */
  at?: Date;
}

/**
 * @description Convierte una duración en minutos a un texto legible en
 * español usando años / meses / días / horas / minutos, omitiendo las
 * unidades más grandes que valgan cero. Evita frases confusas como
 * "3060 min" cuando una ronda lleva días abierta.
 * @example formatDurationSpanish(3060) -> "2 días 3 horas"
 */
export const formatDurationSpanish = (minutes: number): string => {
  const total = Math.floor(Math.max(0, minutes));
  if (total === 0) return "menos de 1 min";

  const MIN = 1;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  const years = Math.floor(total / YEAR);
  const months = Math.floor((total % YEAR) / MONTH);
  const days = Math.floor((total % MONTH) / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const mins = Math.floor((total % HOUR) / MIN);

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
  if (days > 0) parts.push(`${days} ${days === 1 ? "día" : "días"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? "minuto" : "minutos"}`);
  return parts.join(" ");
};


export interface LiveTimelineEvent {
  type: "ROUND_STARTED" | "ROUND_COMPLETED" | "INCIDENT_CREATED" | "INCIDENT_ATTENDED";
  message: string;
  at: Date;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fullName = (u: { name: string; lastName: string | null }) => `${u.name} ${u.lastName ?? ""}`.trim();

const average = (values: number[]) =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

/**
 * Métricas históricas cortas (últimos 7 días) que complementan la foto en
 * vivo: comparativo hoy vs ayer, tendencia diaria de rondas, incidencias por
 * categoría y por hora, y una línea de tiempo de la actividad reciente.
 * Todo se calcula en memoria sobre dos consultas acotadas a 7 días.
 */
export const getLiveInsights = async (now: Date) => {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const since = new Date(todayStart);
  since.setDate(since.getDate() - 6);

  const [rounds, incidents] = await Promise.all([
    prismaClient.round.findMany({
      where: { startTime: { gte: since } },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        guard: { select: { name: true, lastName: true } },
        recurringConfiguration: { select: { title: true } },
      },
    }),
    prismaClient.incident.findMany({
      where: { kind: "INCIDENT", createdAt: { gte: since } },
      select: {
        id: true,
        title: true,
        createdAt: true,
        status: true,
        resolvedAt: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    days.push(dayKey(d));
  }

  const roundsByDay = days.map((date) => {
    const ofDay = rounds.filter((r) => dayKey(r.startTime) === date);
    return { date, started: ofDay.length, completed: ofDay.filter((r) => r.status === "COMPLETED").length };
  });
  const incidentsByDay = days.map((date) => ({
    date,
    count: incidents.filter((i) => dayKey(i.createdAt) === date).length,
  }));

  const completedDurations = rounds
    .filter((r) => r.status === "COMPLETED" && r.endTime)
    .map((r) => Math.round((r.endTime!.getTime() - r.startTime.getTime()) / 60000))
    // Descarta rondas que quedaron abiertas días y se cerraron después: distorsionan el promedio.
    .filter((m) => m >= 0 && m <= 12 * 60);

  const resolutionMinutes = incidents
    .filter((i) => i.status === "ATTENDED" && i.resolvedAt)
    .map((i) => Math.round((i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60000))
    .filter((m) => m >= 0);

  const byCategory = new Map<string, number>();
  for (const i of incidents) {
    const name = i.category?.name ?? "Sin categoría";
    byCategory.set(name, (byCategory.get(name) ?? 0) + 1);
  }
  const incidentsByCategory = [...byCategory.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const incidentsByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const i of incidents) incidentsByHour[i.createdAt.getHours()].count++;

  const events: LiveTimelineEvent[] = [];
  for (const r of rounds) {
    const route = r.recurringConfiguration?.title ?? "Sin ruta";
    events.push({ type: "ROUND_STARTED", message: `${fullName(r.guard)} inició ronda (${route})`, at: r.startTime });
    if (r.status === "COMPLETED" && r.endTime) {
      events.push({ type: "ROUND_COMPLETED", message: `${fullName(r.guard)} completó ronda (${route})`, at: r.endTime });
    }
  }
  for (const i of incidents) {
    events.push({ type: "INCIDENT_CREATED", message: `Incidencia reportada: ${i.title}`, at: i.createdAt });
    if (i.status === "ATTENDED" && i.resolvedAt) {
      events.push({ type: "INCIDENT_ATTENDED", message: `Incidencia atendida: ${i.title}`, at: i.resolvedAt });
    }
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  const today = roundsByDay[6];
  const yesterday = roundsByDay[5];
  return {
    today: {
      roundsStarted: today.started,
      roundsCompleted: today.completed,
      incidentsCreated: incidentsByDay[6].count,
      yesterdayRoundsStarted: yesterday.started,
      yesterdayRoundsCompleted: yesterday.completed,
      yesterdayIncidentsCreated: incidentsByDay[5].count,
    },
    avgRoundMinutes: average(completedDurations),
    avgResolutionMinutes: average(resolutionMinutes),
    roundsByDay,
    incidentsByDay,
    incidentsByCategory,
    incidentsByHour,
    timeline: events.slice(0, 12),
  };
};

export const getLiveDashboard = async () => {
  const now = new Date();
  const staleMinutes = Number(await getSetting("DASHBOARD_STALE_MINUTES", "20")) || 20;

  const [activeRoundsRaw, onShiftUsers, openIncidents, openIncidentsCount, activeRoutes, pendingHandover, insights] =
    await Promise.all([
      prismaClient.round.findMany({
        where: { status: "IN_PROGRESS" },
        include: {
          guard: { select: { id: true, name: true, lastName: true, role: { select: { name: true } } } },
          recurringConfiguration: {
            include: { recurringLocations: { where: { active: true } } },
          },
        },
        orderBy: { startTime: "asc" },
      }),
      prismaClient.user.findMany({
        where: {
          active: true,
          softDelete: false,
          isLoggedIn: true,
          role: { name: { in: ["GUARD", "SHIFT"] } },
        },
        select: { id: true, name: true, lastName: true, role: { select: { name: true } } },
      }),
      // Capped list just to populate the alerts feed (see below); the KPI
      // uses the separate `count()` so it's never wrong even past the cap.
      // "Incidencia" y "Casa Club" comparten la tabla `Incident` (ver
      // incident.service.ts) — sin este filtro, un reporte de Casa Club
      // pendiente se contaba/alertaba aquí como si fuera una incidencia.
      prismaClient.incident.findMany({
        where: { status: "PENDING", kind: "INCIDENT" },
        select: { id: true, title: true, createdAt: true, guardId: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prismaClient.incident.count({ where: { status: "PENDING", kind: "INCIDENT" } }),
      prismaClient.recurringConfiguration.findMany({
        where: { active: true },
        select: { id: true, title: true },
      }),
      getPendingShiftHandover(),
      getLiveInsights(now),
    ]);

  const guardIds = Array.from(
    new Set([...activeRoundsRaw.map((r) => r.guardId), ...onShiftUsers.map((u) => u.id)]),
  );

  // Ventana de escaneos "recientes" a consultar. Por default las últimas
  // 24h alcanzan de sobra, pero si una ronda quedó ABIERTA más tiempo que
  // eso (un guardia que nunca la cerró, como el caso que reportaron: 40+
  // horas activa) sus escaneos son más viejos que esa ventana y se
  // perdían por completo — la ronda se veía "sin avance" en el dashboard
  // aunque sí tuviera escaneos (y el detalle de la ronda, que no tiene
  // este límite, sí los mostraba). Por eso la ventana se extiende hasta el
  // inicio de la ronda activa más antigua, con un tope de 7 días para no
  // disparar una consulta gigante si algo quedó abierto por semanas.
  const MAX_KARDEX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
  const defaultKardexSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const earliestActiveRoundStart = activeRoundsRaw.length
    ? activeRoundsRaw.reduce((min, r) => (r.startTime < min ? r.startTime : min), activeRoundsRaw[0].startTime)
    : null;
  const kardexSince =
    earliestActiveRoundStart && earliestActiveRoundStart < defaultKardexSince
      ? new Date(Math.max(earliestActiveRoundStart.getTime(), now.getTime() - MAX_KARDEX_LOOKBACK_MS))
      : defaultKardexSince;

  // One query for every guard's most recent scans, grouped in memory per
  // guard below.
  const recentKardex = guardIds.length
    ? await prismaClient.kardex.findMany({
        where: {
          userId: { in: guardIds },
          timestamp: { gte: kardexSince },
        },
        include: { location: { select: { name: true } } },
        orderBy: { timestamp: "desc" },
      })
    : [];

  const kardexByGuard = new Map<number, typeof recentKardex>();
  for (const scan of recentKardex) {
    const list = kardexByGuard.get(scan.userId) ?? [];
    list.push(scan);
    kardexByGuard.set(scan.userId, list);
  }

  const alerts: LiveDashboardAlert[] = [];

  const activeRounds = activeRoundsRaw.map((round) => {
    const guardScans = kardexByGuard.get(round.guardId) ?? [];
    // Scans that belong to THIS round (since it started).
    const roundScans = guardScans.filter((s) => s.timestamp >= round.startTime);
    const scannedCount = new Set(roundScans.map((s) => s.locationId)).size;
    const totalLocations = round.recurringConfiguration?.recurringLocations.length ?? null;
    const progressPercent =
      totalLocations && totalLocations > 0
        ? Math.min(100, Math.round((scannedCount / totalLocations) * 100))
        : null;
    const lastScan = roundScans[0] ?? null; // already sorted desc
    const elapsedMinutes = Math.round((now.getTime() - round.startTime.getTime()) / 60000);
    const minutesSinceLastScan = lastScan
      ? Math.round((now.getTime() - lastScan.timestamp.getTime()) / 60000)
      : elapsedMinutes;
    const stale = minutesSinceLastScan >= staleMinutes;

    if (stale) {
      alerts.push({
        type: "ROUND_STALLED",
        severity: "high",
        message: `${round.guard.name} ${round.guard.lastName ?? ""} sin escanear hace ${formatDurationSpanish(minutesSinceLastScan)} (ronda: ${round.recurringConfiguration?.title ?? "Sin ruta"})`,
        refId: round.id,
        at: lastScan ? lastScan.timestamp : round.startTime,
      });
    }

    return {
      roundId: round.id,
      guard: { id: round.guard.id, name: round.guard.name, lastName: round.guard.lastName },
      routeId: round.recurringConfigurationId,
      routeTitle: round.recurringConfiguration?.title ?? null,
      startTime: round.startTime,
      elapsedMinutes,
      totalLocations,
      scannedCount,
      progressPercent,
      lastScan: lastScan
        ? {
            locationName: lastScan.location.name,
            timestamp: lastScan.timestamp,
            latitude: lastScan.latitude,
            longitude: lastScan.longitude,
          }
        : null,
      stale,
    };
  });

  const activeRoundByGuard = new Map(activeRounds.map((r) => [r.guard.id, r]));

  const mapPoints = activeRounds
    .filter((r) => r.lastScan?.latitude != null && r.lastScan?.longitude != null)
    .map((r) => ({
      guardId: r.guard.id,
      guardName: `${r.guard.name} ${r.guard.lastName ?? ""}`.trim(),
      roundId: r.roundId,
      routeTitle: r.routeTitle,
      lat: r.lastScan!.latitude as number,
      lng: r.lastScan!.longitude as number,
      timestamp: r.lastScan!.timestamp,
    }));

  // "Uniforme pendiente hoy" only applies to GUARD (SHIFT/ADMIN evaluate them,
  // not the other way around).
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const guardRoleIds = onShiftUsers.filter((u) => u.role?.name === "GUARD").map((u) => u.id);
  const uniformCheckedToday = guardRoleIds.length
    ? await prismaClient.uniformCheck.findMany({
        where: { guardId: { in: guardRoleIds }, createdAt: { gte: todayStart } },
        select: { guardId: true },
      })
    : [];
  const uniformCheckedGuardIds = new Set(uniformCheckedToday.map((u) => u.guardId));

  const guardsOnShift = onShiftUsers.map((u) => {
    const guardScans = kardexByGuard.get(u.id) ?? [];
    const lastActivityAt = guardScans[0]?.timestamp ?? null;
    return {
      guardId: u.id,
      name: u.name,
      lastName: u.lastName,
      role: u.role?.name ?? "GUARD",
      status: activeRoundByGuard.has(u.id) ? ("ON_ROUND" as const) : ("IDLE" as const),
      lastActivityAt,
      uniformCheckPending: u.role?.name === "GUARD" ? !uniformCheckedGuardIds.has(u.id) : false,
    };
  });

  if (pendingHandover.pending) {
    alerts.push({
      type: "SHIFT_HANDOVER_OVERDUE",
      severity: "high",
      message: `Entrega de turno ${pendingHandover.shiftType === "MATUTINO" ? "Matutino" : "Nocturno"} pendiente (${pendingHandover.date})`,
    });
  }

  for (const incident of openIncidents) {
    alerts.push({
      type: "INCIDENT_OPEN",
      severity: "medium",
      message: `Incidencia sin atender: ${incident.title}`,
      refId: incident.id,
      at: incident.createdAt,
    });
  }

  const coveredRouteIds = new Set(
    activeRounds.map((r) => r.routeId).filter((id): id is number => id != null),
  );
  const uncoveredRoutes = activeRoutes.filter((r) => !coveredRouteIds.has(r.id));

  return {
    generatedAt: now,
    kpis: {
      activeRoundsCount: activeRounds.length,
      guardsOnShiftCount: guardsOnShift.length,
      openIncidentsCount: openIncidentsCount,
      routesTotal: activeRoutes.length,
      routesCovered: coveredRouteIds.size,
    },
    activeRounds,
    mapPoints,
    guardsOnShift,
    alerts,
    uncoveredRoutes,
    insights,
  };
};
