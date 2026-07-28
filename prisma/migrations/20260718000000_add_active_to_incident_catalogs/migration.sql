-- AlterTable
ALTER TABLE "IncidentCategory" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "IncidentType" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
