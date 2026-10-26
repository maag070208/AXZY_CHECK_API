-- Permisos de finanzas del residente (módulo 13, fase 3).
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'charge.%' OR "code" LIKE 'payment.%');
--           DELETE FROM "Permission" WHERE "code" LIKE 'charge.%' OR "code" LIKE 'payment.%';
INSERT INTO "Permission" ("code", "description") VALUES
  ('charge.view', 'Consultar cargos (el residente, solo los propios)'),
  ('charge.manage', 'Registrar, generar y cancelar cargos'),
  ('payment.view', 'Consultar pagos (el residente, solo los aplicados a sus cargos)'),
  ('payment.manage', 'Registrar y reversar pagos')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."name" = 'ADMIN' AND p."code" IN ('charge.view', 'charge.manage', 'payment.view', 'payment.manage'))
  OR (r."name" = 'RESDN' AND p."code" IN ('charge.view', 'payment.view'))
)
ON CONFLICT DO NOTHING;
