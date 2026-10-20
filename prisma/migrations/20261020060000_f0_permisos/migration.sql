-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;




-- Permisos iniciales (T-F0-07): reproducen los accesos de los requireRole anteriores.
INSERT INTO "Permission" ("code", "description")
VALUES
  ('assignments.manage', 'Asignar y revisar rondas/tareas de guardias'),
  ('catalogs.manage', 'Administrar catálogos'),
  ('chat.use', 'Usar el chat del equipo'),
  ('club.manage', 'Resolver y eliminar reportes de club'),
  ('dashboard.view', 'Ver el dashboard operativo'),
  ('incidents.manage', 'Resolver y eliminar incidentes'),
  ('kardex.manage', 'Eliminar registros y evidencias de bitácora'),
  ('locations.manage', 'Crear, editar y eliminar ubicaciones'),
  ('maintenance.manage', 'Resolver y eliminar reportes de mantenimiento'),
  ('properties.manage', 'Administrar propiedades'),
  ('recurring.manage', 'Administrar rutas recurrentes'),
  ('recurring.operate', 'Ver y ejecutar mis rutas recurrentes'),
  ('residents.manage', 'Administrar residentes y contactos'),
  ('schedules.manage', 'Administrar horarios'),
  ('settings.manage', 'Administrar ajustes del cliente'),
  ('shift-handover.manage', 'Entrega de turno'),
  ('uniform.manage', 'Revisión de uniforme'),
  ('users.manage', 'Administrar usuarios'),
  ('users.read', 'Consultar usuarios')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('ADMIN', 'assignments.manage'),
  ('ADMIN', 'catalogs.manage'),
  ('ADMIN', 'chat.use'),
  ('ADMIN', 'club.manage'),
  ('ADMIN', 'dashboard.view'),
  ('ADMIN', 'incidents.manage'),
  ('ADMIN', 'kardex.manage'),
  ('ADMIN', 'locations.manage'),
  ('ADMIN', 'maintenance.manage'),
  ('ADMIN', 'properties.manage'),
  ('ADMIN', 'recurring.manage'),
  ('ADMIN', 'recurring.operate'),
  ('ADMIN', 'residents.manage'),
  ('ADMIN', 'schedules.manage'),
  ('ADMIN', 'settings.manage'),
  ('ADMIN', 'shift-handover.manage'),
  ('ADMIN', 'uniform.manage'),
  ('ADMIN', 'users.manage'),
  ('ADMIN', 'users.read'),
  ('SHIFT', 'assignments.manage'),
  ('SHIFT', 'chat.use'),
  ('SHIFT', 'club.manage'),
  ('SHIFT', 'dashboard.view'),
  ('SHIFT', 'incidents.manage'),
  ('SHIFT', 'kardex.manage'),
  ('SHIFT', 'locations.manage'),
  ('SHIFT', 'recurring.manage'),
  ('SHIFT', 'recurring.operate'),
  ('SHIFT', 'shift-handover.manage'),
  ('SHIFT', 'uniform.manage'),
  ('SHIFT', 'users.read'),
  ('GUARD', 'chat.use'),
  ('GUARD', 'recurring.operate'),
  ('MAINT', 'chat.use'),
  ('MAINT', 'maintenance.manage'),
  ('MAINT', 'recurring.operate')
) AS m("role", "code")
JOIN "Role" r ON r."name" = m."role"
JOIN "Permission" p ON p."code" = m."code"
ON CONFLICT DO NOTHING;
