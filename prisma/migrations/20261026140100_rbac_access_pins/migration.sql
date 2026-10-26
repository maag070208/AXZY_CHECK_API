-- Permisos de clave peatonal.
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'accesspin.%');
--           DELETE FROM "Permission" WHERE "code" LIKE 'accesspin.%';
INSERT INTO "Permission" ("code", "description") VALUES
  ('accesspin.manage', 'Generar, consultar y revocar mi clave peatonal'),
  ('accesspin.validate', 'Validar claves peatonales en caseta')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."name" = 'ADMIN' AND p."code" = 'accesspin.validate')
  OR (r."name" = 'SHIFT' AND p."code" = 'accesspin.validate')
  OR (r."name" = 'GUARD' AND p."code" = 'accesspin.validate')
  OR (r."name" = 'RESDN' AND p."code" = 'accesspin.manage')
)
ON CONFLICT DO NOTHING;
