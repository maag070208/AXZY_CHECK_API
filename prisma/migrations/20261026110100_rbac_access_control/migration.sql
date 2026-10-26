-- Permisos de configuración de morosos y bitácora de accesos.
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'delinquency.%' OR "code" = 'access.event.view');
--           DELETE FROM "Permission" WHERE "code" LIKE 'delinquency.%' OR "code" = 'access.event.view';
INSERT INTO "Permission" ("code", "description") VALUES
  ('delinquency.view', 'Consultar la regla de morosos y sus excepciones'),
  ('delinquency.manage', 'Configurar la regla de morosos y autorizar excepciones'),
  ('access.event.view', 'Consultar la bitácora de accesos')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."name" = 'ADMIN' AND p."code" IN ('delinquency.view', 'delinquency.manage', 'access.event.view'))
  OR (r."name" = 'SHIFT' AND p."code" IN ('delinquency.view', 'access.event.view'))
)
ON CONFLICT DO NOTHING;
