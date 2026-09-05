-- AlterTable
ALTER TABLE "IncidentCategory" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "IncidentType" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
