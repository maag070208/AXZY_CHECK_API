-- Foto de perfil del residente (ResidentProfile.photoUrl/photoKey). Aditiva.
-- Rollback: ALTER TABLE "ResidentProfile" DROP COLUMN "photoUrl", DROP COLUMN "photoKey";
ALTER TABLE "ResidentProfile" ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "photoKey" TEXT;
