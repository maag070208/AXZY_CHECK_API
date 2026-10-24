INSERT INTO "Permission" ("code", "description") VALUES
  ('kardex.delete', 'Eliminar kardex y sus evidencias')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'kardex.delete'
WHERE r."name" IN ('ADMIN', 'SHIFT')
ON CONFLICT DO NOTHING;
