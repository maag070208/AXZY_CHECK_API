-- Multicliente, fase 2 cierre: deshace 20261102190000_multi_tenant_contract.
-- Vuelve a dejar nullables las columnas y restaura los únicos globales de Location.name y Property.identifier.
-- OJO: el único global falla si ya existen nombres/identificadores repetidos entre clientes (creados después de
-- la contracción). En ese caso, primero hay que renombrar los duplicados.
-- Después: DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102190000_multi_tenant_contract';
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/multi-tenant/rollback-contract.sql
DROP INDEX "Location_clientId_name_key";
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

DROP INDEX "Property_clientId_identifier_key";
CREATE UNIQUE INDEX "Property_identifier_key" ON "Property"("identifier");

ALTER TABLE "User" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "RecurringConfiguration" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Incident" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Round" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Kardex" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Announcement" ALTER COLUMN "clientId" DROP NOT NULL;
