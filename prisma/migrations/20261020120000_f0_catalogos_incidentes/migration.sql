-- AlterTable
ALTER TABLE "IncidentCategory" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "IncidentType" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

