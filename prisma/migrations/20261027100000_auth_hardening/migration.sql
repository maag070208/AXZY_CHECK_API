-- Endurecimiento de autenticación (auditoría S-25, S-26). Aditiva.
-- Rollback: ALTER TABLE "User" DROP COLUMN "tokenVersion", DROP COLUMN "failedLoginCount", DROP COLUMN "lockedUntil";
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);
