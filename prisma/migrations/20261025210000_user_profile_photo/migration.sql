-- Foto de perfil del personal (guardias, jefe de guardias, mantenimiento y administración).
-- Aditiva: no toca datos existentes.
-- Rollback: ALTER TABLE "User" DROP COLUMN "photoUrl", DROP COLUMN "photoKey";
ALTER TABLE "User" ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "photoKey" TEXT;
