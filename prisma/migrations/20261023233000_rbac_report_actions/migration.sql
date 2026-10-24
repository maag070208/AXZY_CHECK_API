-- RBAC por acción: reportes (incidencias, mantenimiento, casa club),
-- asignaciones propias y lectura de kardex. Aditivo: no elimina permisos
-- de módulo existentes.

INSERT INTO "Permission" ("code", "description") VALUES
  ('assignment.view', 'Consultar mis asignaciones'),
  ('kardex.view', 'Consultar kardex y evidencias'),
  ('incident.view', 'Consultar incidencias'),
  ('incident.create', 'Crear incidencias'),
  ('incident.resolve', 'Resolver incidencias'),
  ('incident.delete', 'Eliminar incidencias y sus evidencias'),
  ('maintenance.view', 'Consultar reportes de mantenimiento'),
  ('maintenance.create', 'Crear reportes de mantenimiento'),
  ('maintenance.resolve', 'Resolver reportes de mantenimiento'),
  ('maintenance.delete', 'Eliminar reportes de mantenimiento'),
  ('club.view', 'Consultar reportes de casa club'),
  ('club.create', 'Crear reportes de casa club'),
  ('club.resolve', 'Resolver reportes de casa club'),
  ('club.delete', 'Eliminar reportes de casa club')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

-- ADMIN: todos los nuevos.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p
  ON p."code" IN (
    'assignment.view','kardex.view',
    'incident.view','incident.create','incident.resolve','incident.delete',
    'maintenance.view','maintenance.create','maintenance.resolve','maintenance.delete',
    'club.view','club.create','club.resolve','club.delete'
  )
WHERE r."name" = 'ADMIN'
ON CONFLICT DO NOTHING;

-- SHIFT.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p
  ON p."code" IN (
    'assignment.view','kardex.view',
    'incident.view','incident.create','incident.resolve','incident.delete',
    'maintenance.view','maintenance.create',
    'club.view','club.create','club.resolve','club.delete'
  )
WHERE r."name" = 'SHIFT'
ON CONFLICT DO NOTHING;

-- GUARD.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p
  ON p."code" IN (
    'assignment.view','incident.create','maintenance.create','club.view','club.create'
  )
WHERE r."name" = 'GUARD'
ON CONFLICT DO NOTHING;

-- MAINT.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p
  ON p."code" IN (
    'assignment.view','incident.create',
    'maintenance.view','maintenance.create','maintenance.resolve','maintenance.delete',
    'club.view','club.create','club.resolve','club.delete'
  )
WHERE r."name" = 'MAINT'
ON CONFLICT DO NOTHING;
