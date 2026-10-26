-- Permisos del buzón de quejas (módulo 13).
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'complaint.%');
--           DELETE FROM "Permission" WHERE "code" LIKE 'complaint.%';
INSERT INTO "Permission" ("code", "description") VALUES
  ('complaint.create', 'Levantar quejas o sugerencias'),
  ('complaint.view', 'Consultar quejas (el residente, solo las propias)'),
  ('complaint.manage', 'Responder, cambiar estado y ver notas internas de quejas')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
  (r."name" = 'RESDN' AND p."code" IN ('complaint.create', 'complaint.view'))
  OR (r."name" = 'ADMIN' AND p."code" IN ('complaint.view', 'complaint.manage'))
  OR (r."name" = 'SHIFT' AND p."code" IN ('complaint.view', 'complaint.manage'))
)
ON CONFLICT DO NOTHING;
