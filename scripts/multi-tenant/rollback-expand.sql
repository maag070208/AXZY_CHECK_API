-- Multicliente, fase 0: deshace 20261102120000_multi_tenant_expand. Borra organizaciones, clientes y asignaciones
-- de guardia; las filas de las demás tablas se quedan como estaban antes de la migración.
-- Después: DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102120000_multi_tenant_expand';
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/multi-tenant/rollback-expand.sql
ALTER TABLE "User" DROP COLUMN "organizationId";
ALTER TABLE "Property" DROP COLUMN "clientId";
ALTER TABLE "Location" DROP COLUMN "clientId";
ALTER TABLE "RecurringConfiguration" DROP COLUMN "clientId";
ALTER TABLE "Assignment" DROP COLUMN "clientId";
ALTER TABLE "Incident" DROP COLUMN "clientId";
ALTER TABLE "Round" DROP COLUMN "clientId";
ALTER TABLE "Kardex" DROP COLUMN "clientId";
ALTER TABLE "Announcement" DROP COLUMN "clientId";
DROP TABLE "GuardAssignment";
DROP TABLE "Client";
DROP TABLE "Organization";
DROP TYPE "ClientType";
DROP TYPE "OrganizationKind";
