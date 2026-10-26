-- Permisos de avisos/comunicados.
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'announcement.%');
--           DELETE FROM "Permission" WHERE "code" LIKE 'announcement.%';
INSERT INTO "Permission" ("code", "description") VALUES
  ('announcement.view', 'Consultar avisos y comunicados'),
  ('announcement.manage', 'Crear y enviar avisos a residentes')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."name" = 'ADMIN' AND p."code" IN ('announcement.view', 'announcement.manage'))
  OR (r."name" = 'SHIFT' AND p."code" = 'announcement.view')
)
ON CONFLICT DO NOTHING;
