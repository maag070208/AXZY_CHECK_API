-- Multicliente, fase 5: deshace la contracción de la fase 5 (vuelve a dejar nullables los clientId).
-- Después: DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102201000_phase5_contract';
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/multi-tenant/rollback-phase5-contract.sql
ALTER TABLE "Person" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Maintenance" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "AccessPin" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "ShiftHandover" ALTER COLUMN "clientId" DROP NOT NULL;
