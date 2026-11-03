import { AppError } from "@src/core/errors/app-error";

/**
 * Multicliente: alcance de la petición. Sale de la sesión (usuario del token + base), NUNCA de
 * `query` ni `body`. Lo arma `authenticate` y queda en `req.scope`.
 */
export type ClientScope = {
  organizationId: number | null;
  clientId: number | null;
};

/** Datos de la sesión con los que se resuelve el alcance (ya filtrados a la organización activa del usuario). */
export type ScopeSource = {
  role: string;
  organizationId: number | null;
  /** Cliente de la asignación activa del guardia. */
  assignedClientId: number | null;
  /** Cliente de la propiedad del residente. */
  propertyClientId: number | null;
  /** Cliente del usuario cuando su rol es CLIENT (administrador del cliente). */
  userClientId: number | null;
  /** Clientes activos de la organización, entre los que elige un rol de organización. */
  organizationClientIds: number[];
};

export type ScopeResult =
  | { ok: true; scope: ClientScope }
  | { ok: false; status: 400 | 403; message: string };

/** Guardias y jefes de turno: el cliente es el de su asignación activa. */
export const ASSIGNED_ROLES: ReadonlyArray<string> = ["GUARD", "SHIFT"];
/** Administración de la organización: elige cliente con X-Client-Id. */
const ORGANIZATION_ROLES: ReadonlyArray<string> = ["ADMIN", "MAINT"];
const RESIDENT_ROLES: ReadonlyArray<string> = ["RESDN"];
/** Administrador del cliente (residencial, plaza o maquila): su alcance es fijo a su cliente. */
export const CLIENT_ROLES: ReadonlyArray<string> = ["CLIENT"];

export const CLIENT_HEADER = "x-client-id";

const fixedClientFor = (source: ScopeSource): number | null => {
  if (ASSIGNED_ROLES.includes(source.role)) return source.assignedClientId;
  if (RESIDENT_ROLES.includes(source.role)) return source.propertyClientId;
  if (CLIENT_ROLES.includes(source.role)) return source.userClientId;
  return null;
};

/**
 * Resuelve el cliente de la petición:
 * - Guardia o jefe de turno: su asignación activa; sin asignación no hay cliente.
 * - Residente: el cliente de su propiedad.
 * - CLIENT (administrador del cliente): el cliente al que pertenece el usuario, sin selector.
 * - Rol de organización: el cliente de X-Client-Id, validado contra su organización. Sin encabezado,
 *   el único cliente si la organización tiene uno (producto 1); si tiene varios, ninguno.
 * - Cualquier otro rol: ninguno.
 * Un X-Client-Id que no corresponde al usuario es 403, no se ignora.
 */
export const resolveClientScope = (source: ScopeSource, requestedHeader: string | undefined): ScopeResult => {
  let requested: number | null = null;
  if (requestedHeader !== undefined && requestedHeader !== "") {
    if (!/^[1-9]\d{0,9}$/.test(requestedHeader)) {
      return { ok: false, status: 400, message: "X-Client-Id no es válido" };
    }
    requested = Number(requestedHeader);
  }
  const forbidden: ScopeResult = { ok: false, status: 403, message: "No tienes acceso a ese cliente" };

  if (ORGANIZATION_ROLES.includes(source.role)) {
    if (requested !== null) {
      return source.organizationClientIds.includes(requested)
        ? { ok: true, scope: { organizationId: source.organizationId, clientId: requested } }
        : forbidden;
    }
    const only = source.organizationClientIds.length === 1 ? source.organizationClientIds[0] : null;
    return { ok: true, scope: { organizationId: source.organizationId, clientId: only } };
  }

  const clientId = fixedClientFor(source);
  if (requested !== null && requested !== clientId) return forbidden;
  return { ok: true, scope: { organizationId: source.organizationId, clientId } };
};

/**
 * Filtro único para datos de cliente: `where: { ...scopeByClient(req.scope), ... }` en lecturas y
 * `data: { ...scopeByClient(req.scope), ... }` en escrituras. Sin cliente en el alcance (guardia sin
 * asignación, organización con varios clientes sin X-Client-Id) responde 403 en lugar de devolver datos.
 */
export const scopeByClient = (scope: ClientScope | undefined): { clientId: number } => {
  if (!scope?.clientId) {
    throw new AppError("CLIENT_SCOPE_REQUIRED", "No hay un cliente asignado o seleccionado", 403);
  }
  return { clientId: scope.clientId };
};

/**
 * `where` para modelos que llegan al cliente a través de su propiedad (`propertyId`): cargos, pagos,
 * invitaciones, accesos, vehículos, quejas, autorizaciones y pases. Ejemplo:
 * `where: { id, ...scopeByProperty(scope) }` filtra por `property.clientId`.
 */
export const scopeByProperty = (scope: ClientScope | undefined): { property: { clientId: number } } => ({
  property: scopeByClient(scope),
});
