-- GUARD necesita ver los reportes que crea y el contador de pendientes en su APP.
-- Rollback: DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'GUARD') AND "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" IN ('incident.view', 'maintenance.view'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON r."name" = 'GUARD' AND p."code" IN ('incident.view', 'maintenance.view')
ON CONFLICT DO NOTHING;
