-- Foto opcional del contacto de la agenda del residente. Aditiva.
-- Rollback: ALTER TABLE "ResidentContact" DROP COLUMN "photoUrl", DROP COLUMN "photoKey";
ALTER TABLE "ResidentContact" ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "photoKey" TEXT;
