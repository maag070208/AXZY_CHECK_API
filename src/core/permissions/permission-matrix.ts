/**
 * [T-F0-07] Permisos iniciales por rol. Es la semilla: en runtime la fuente de
 * verdad son las tablas Permission y RolePermission. Reproduce exactamente los
 * accesos que daban los `requireRole` anteriores.
 */
export const PERMISSIONS = [
  { code: "assignments.manage", description: "Asignar y revisar rondas/tareas de guardias" },
  { code: "catalogs.manage", description: "Administrar catálogos" },
  { code: "chat.use", description: "Usar el chat del equipo" },
  { code: "club.manage", description: "Resolver y eliminar reportes de club" },
  { code: "dashboard.view", description: "Ver el dashboard operativo" },
  { code: "documents.view", description: "Consultar documentos privados de personas" },
  { code: "incidents.manage", description: "Resolver y eliminar incidentes" },
  { code: "kardex.manage", description: "Eliminar registros y evidencias de bitácora" },
  { code: "locations.manage", description: "Crear, editar y eliminar ubicaciones" },
  { code: "maintenance.manage", description: "Resolver y eliminar reportes de mantenimiento" },
  { code: "occupancy.change", description: "Cambiar la ocupación de una propiedad" },
  { code: "properties.manage", description: "Administrar propiedades" },
  { code: "properties.view", description: "Consultar propiedades y su ocupación" },
  { code: "recurring.manage", description: "Administrar rutas recurrentes" },
  { code: "recurring.operate", description: "Ver y ejecutar mis rutas recurrentes" },
  { code: "residents.manage", description: "Administrar residentes y contactos" },
  { code: "schedules.manage", description: "Administrar horarios" },
  { code: "settings.manage", description: "Administrar ajustes del cliente" },
  { code: "shift-handover.manage", description: "Entrega de turno" },
  { code: "uniform.manage", description: "Revisión de uniforme" },
  { code: "users.manage", description: "Administrar usuarios" },
  { code: "users.read", description: "Consultar usuarios" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

const ALL = PERMISSIONS.map((p) => p.code) as PermissionCode[];

export const ROLE_PERMISSIONS: Record<string, readonly PermissionCode[]> = {
  ADMIN: ALL,
  SHIFT: [
    "assignments.manage",
    "properties.view",
    "chat.use",
    "club.manage",
    "dashboard.view",
    "incidents.manage",
    "kardex.manage",
    "locations.manage",
    "recurring.manage",
    "recurring.operate",
    "shift-handover.manage",
    "uniform.manage",
    "users.read",
  ],
  GUARD: ["chat.use", "recurring.operate"],
  MAINT: ["chat.use", "maintenance.manage", "recurring.operate"],
  RESDN: [],
};
