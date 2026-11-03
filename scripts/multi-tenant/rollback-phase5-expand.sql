-- Multicliente, fase 5: deshace 20261102200000_phase5_expand.
-- OJO: los únicos globales fallan si ya hay PINs/tags/entregas repetidos entre clientes; renombrar duplicados antes.
-- Después: DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102200000_phase5_expand';
-- NOTA: el rollback de la fase 5 debe ejecutarse ANTES del de la contracción de fase 5 (si ya se aplicó).
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/multi-tenant/rollback-phase5-expand.sql
DROP INDEX "AccessPin_clientId_pinHash_key";
CREATE UNIQUE INDEX "AccessPin_pinHash_key" ON "AccessPin"("pinHash");

DROP INDEX "Vehicle_clientId_tagCode_key";
CREATE UNIQUE INDEX "Vehicle_tagCode_key" ON "Vehicle"("tagCode");

DROP INDEX "ShiftHandover_clientId_shiftType_handoverDate_key";
CREATE UNIQUE INDEX "ShiftHandover_shiftType_handoverDate_key" ON "ShiftHandover"("shiftType", "handoverDate");

ALTER TABLE "Person" DROP CONSTRAINT "Person_clientId_fkey";
ALTER TABLE "Maintenance" DROP CONSTRAINT "Maintenance_clientId_fkey";
ALTER TABLE "AccessPin" DROP CONSTRAINT "AccessPin_clientId_fkey";
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_clientId_fkey";
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_clientId_fkey";
ALTER TABLE "ShiftHandover" DROP CONSTRAINT "ShiftHandover_clientId_fkey";

DROP INDEX "Person_clientId_idx";
DROP INDEX "Maintenance_clientId_createdAt_idx";
DROP INDEX "AccessPin_clientId_idx";
DROP INDEX "Vehicle_clientId_idx";
DROP INDEX "ChatMessage_clientId_createdAt_idx";
DROP INDEX "ShiftHandover_clientId_handoverDate_idx";

-- Restaurar los índices simples anteriores.
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");
CREATE INDEX "ShiftHandover_handoverDate_idx" ON "ShiftHandover"("handoverDate");

ALTER TABLE "Person" DROP COLUMN "clientId";
ALTER TABLE "Maintenance" DROP COLUMN "clientId";
ALTER TABLE "AccessPin" DROP COLUMN "clientId";
ALTER TABLE "Vehicle" DROP COLUMN "clientId";
ALTER TABLE "ChatMessage" DROP COLUMN "clientId";
ALTER TABLE "ShiftHandover" DROP COLUMN "clientId";
