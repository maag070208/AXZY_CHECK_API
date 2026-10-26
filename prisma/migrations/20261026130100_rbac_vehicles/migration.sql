-- Permisos del padrón de vehículos.
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'vehicle.%');
--           DELETE FROM "Permission" WHERE "code" LIKE 'vehicle.%';
INSERT INTO "Permission" ("code", "description") VALUES
  ('vehicle.view', 'Consultar el padrón de vehículos'),
  ('vehicle.manage', 'Registrar, aprobar, editar y desactivar vehículos'),
  ('vehicle.self', 'Registrar y consultar mis propios vehículos')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."name" = 'ADMIN' AND p."code" IN ('vehicle.view', 'vehicle.manage'))
  OR (r."name" = 'SHIFT' AND p."code" = 'vehicle.view')
  OR (r."name" = 'RESDN' AND p."code" = 'vehicle.self')
)
ON CONFLICT DO NOTHING;
