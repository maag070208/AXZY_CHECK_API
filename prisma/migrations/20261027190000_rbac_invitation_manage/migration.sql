-- Permiso de caseta para pases de visita: antes las rutas de /invitations no exigían permiso
-- y cualquier rol con sesión (p. ej. mantenimiento) listaba todos los pases.
-- Rollback: DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" = 'invitation.manage');
--           DELETE FROM "Permission" WHERE "code" = 'invitation.manage';
INSERT INTO "Permission" ("code", "description") VALUES
  ('invitation.manage', 'Consultar todos los pases y registrar entradas y salidas')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'invitation.manage'
WHERE r."name" IN ('ADMIN', 'SHIFT', 'GUARD')
ON CONFLICT DO NOTHING;
