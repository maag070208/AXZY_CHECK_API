-- Multicliente, fase 3: deshace 20261102191000_client_role_expand.
-- Después: DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102191000_client_role_expand';
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/multi-tenant/rollback-client-role.sql
ALTER TABLE "User" DROP CONSTRAINT "User_clientId_fkey";
DROP INDEX "User_clientId_idx";
ALTER TABLE "User" DROP COLUMN "clientId";
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'CLIENT');
DELETE FROM "Role" WHERE "name" = 'CLIENT';
