-- Alinea las migraciones con schema.prisma (deriva detectada en la auditoría de E1).
-- `active` ya la usa el código de catálogos. Idempotente: en bases donde la columna
-- existe (creada a mano en operación), no cambia nada.
ALTER TABLE "IncidentCategory" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "IncidentType" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
-- updatedAt lo gestiona Prisma (@updatedAt); no debe tener default en la base.
ALTER TABLE "IncidentCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "IncidentType" ALTER COLUMN "updatedAt" DROP DEFAULT;
