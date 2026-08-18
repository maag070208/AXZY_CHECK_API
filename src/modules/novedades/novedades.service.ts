import { prismaClient } from "@src/core/config/database";
import { ablyService } from "./ably.service";
import {
  NOVEDADES_ROLES,
  NOVEDADES_CHANNEL,
} from "./novedades.constants";
import {
  CreateNovedadInput,
  NovedadPage,
  NovedadQueryInput,
  NovedadResponse,
} from "./novedades.dto";

/**
 * @description Construye el DTO de salida de una novedad a partir del
 * registro persistido, incluyendo el nombre y rol del autor.
 * @param row Registro de Prisma con la relación `user` y `user.role`.
 * @returns Payload listo para clientes y para difundir por Ably.
 */
const toNovedadResponse = (row: {
  id: string;
  userId: number;
  message: string;
  createdAt: Date;
  user: { name: string; lastName: string | null; role: { value: string } };
}): NovedadResponse => ({
  id: row.id,
  userId: row.userId,
  userName: `${row.user.name}${row.user.lastName ? ` ${row.user.lastName}` : ""}`.trim(),
  userRole: row.user.role.value,
  message: row.message,
  createdAt: row.createdAt.toISOString(),
});

/**
 * @description Valida que el rol del usuario esté autorizado para el módulo
 * de novedades.
 * @param role Nombre del rol (p. ej. "GUARD").
 * @throws Error de negocio si el rol no está autorizado.
 */
const assertRoleAllowed = (role?: string): void => {
  if (!role || !(NOVEDADES_ROLES as readonly string[]).includes(role)) {
    throw new Error("Rol no autorizado para novedades");
  }
};

/**
 * @description Crea una novedad: persiste el mensaje en la base de datos y lo
 * difunde en tiempo real a través de Ably.
 * @param data Datos validados (mensaje).
 * @param actor Usuario autenticado que publica (id y rol).
 * @returns La novedad creada con datos del autor.
 * @throws Si el rol no está autorizado o la persistencia falla.
 */
export const createNovedad = async (
  data: CreateNovedadInput,
  actor: { id: number; role?: string },
): Promise<NovedadResponse> => {
  assertRoleAllowed(actor.role);

  const novedad = await prismaClient.novedad.create({
    data: {
      userId: Number(actor.id),
      message: data.message,
    },
    select: {
      id: true,
      userId: true,
      message: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          lastName: true,
          role: { select: { value: true } },
        },
      },
    },
  });

  const response = toNovedadResponse(novedad);

  // Difusión en tiempo real: no debe bloquear la respuesta aunque Ably falle.
  setImmediate(async () => {
    try {
      await ablyService.publishNovedad({ ...response, channel: NOVEDADES_CHANNEL });
    } catch (error) {
      console.error("[Ably] Error al publicar novedad:", error);
    }
  });

  return response;
};

/**
 * @description Obtiene el historial de novedades paginado, con las más
 * recientes primero.
 * @param query Parámetros de paginación.
 * @returns Página de novedades con su total.
 */
export const getNovedades = async (query: NovedadQueryInput): Promise<NovedadPage> => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 30;

  const [rows, total] = await Promise.all([
    prismaClient.novedad.findMany({
      select: {
        id: true,
        userId: true,
        message: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            lastName: true,
            role: { select: { value: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prismaClient.novedad.count(),
  ]);

  return {
    rows: rows.map(toNovedadResponse),
    total,
    page,
    limit,
  };
};

/**
 * @description Emite una solicitud de token de Ably para el usuario autenticado,
 * con capability restringida a suscripción del canal de novedades.
 * @param actor Usuario autenticado (id y rol).
 * @returns El tokenRequest firmado por el servidor.
 * @throws Si el rol no está autorizado o Ably no está configurado.
 */
export const getAblyTokenRequest = async (actor: { id: number; role?: string }) => {
  assertRoleAllowed(actor.role);
  return ablyService.createTokenRequest(String(actor.id));
};
