-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('ASSIGNMENT', 'RECURRING', 'FREE');

-- AlterTable
ALTER TABLE "Kardex" ADD COLUMN     "scanType" "ScanType" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "RecurringLocation" (
    "id" SERIAL NOT NULL,
    "locationId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTask" (
    "id" SERIAL NOT NULL,
    "recurringLocationId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reqPhoto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RecurringLocation" ADD CONSTRAINT "RecurringLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_recurringLocationId_fkey" FOREIGN KEY ("recurringLocationId") REFERENCES "RecurringLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
