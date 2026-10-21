/**
 * Datos fijos de los seeds por flujo. Todo es ficticio: nombres inventados,
 * teléfonos 555-01xx y correos @example.test. Nunca copiar datos reales.
 */
export const FLOW_PASSWORD = "Flujo-123456";

/** Usuarios de cada rol; el prefijo `flow_` los distingue de los de demo. */
export const FLOW_USERS = {
  admin: { username: "flow_admin", name: "Ana", lastName: "Administradora", role: "ADMIN" },
  shift: { username: "flow_shift", name: "Sergio", lastName: "Supervisor", role: "SHIFT" },
  guard1: { username: "flow_guard1", name: "Gabriela", lastName: "Guardia Uno", role: "GUARD" },
  guard2: { username: "flow_guard2", name: "Gonzalo", lastName: "Guardia Dos", role: "GUARD" },
  maint: { username: "flow_maint", name: "Mateo", lastName: "Mantenimiento", role: "MAINT" },
  resident: { username: "flow_resident", name: "Rosa", lastName: "Residente", role: "RESDN" },
} as const;

export type FlowUserKey = keyof typeof FLOW_USERS;

/** Turno que cubre todo el día: el login por horario nunca falla en pruebas. */
export const FLOW_SCHEDULE = { name: "Turno completo (flujos)", startTime: "00:00", endTime: "23:59" } as const;

export const FLOW_LOCATIONS = [
  { name: "Flujo · Acceso principal", aisle: "ACCESO", spot: "PUERTA", number: "1" },
  { name: "Flujo · Caseta", aisle: "ACCESO", spot: "CASETA", number: "2" },
  { name: "Flujo · Alberca", aisle: "AMENIDADES", spot: "ALBERCA", number: "3" },
  { name: "Flujo · Jardín central", aisle: "AREAS_VERDES", spot: "JARDIN", number: "4" },
] as const;

export const FLOW_ROUTE_TITLE = "Flujo · Ronda perimetral";

export const FLOW_PROPERTIES = {
  house: { identifier: "FLUJO-CASA-01", name: "Casa Flujo 1", mainStreet: "Calle Prueba 101" },
  apartment: { identifier: "FLUJO-DEPA-01", name: "Departamento Flujo 1", mainStreet: "Calle Prueba 200" },
  vacant: { identifier: "FLUJO-CASA-02", name: "Casa Flujo 2", mainStreet: "Calle Prueba 102" },
} as const;

export const FLOW_BUILDING = "Torre Flujo";
