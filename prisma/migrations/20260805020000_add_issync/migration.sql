-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "isSync" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Kardex" ADD COLUMN "isSync" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Maintenance" ADD COLUMN "isSync" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN "isSync" BOOLEAN NOT NULL DEFAULT true;
