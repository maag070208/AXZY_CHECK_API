/*
  Warnings:

  - Added the required column `configurationId` to the `RecurringLocation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RecurringLocation" ADD COLUMN     "configurationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isLoggedIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringConfigurationId" INTEGER;

-- CreateTable
CREATE TABLE "RecurringConfiguration" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" SERIAL NOT NULL,
    "guardId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "media" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RecurringAssignments" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_RecurringAssignments_AB_unique" ON "_RecurringAssignments"("A", "B");

-- CreateIndex
CREATE INDEX "_RecurringAssignments_B_index" ON "_RecurringAssignments"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_recurringConfigurationId_fkey" FOREIGN KEY ("recurringConfigurationId") REFERENCES "RecurringConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringLocation" ADD CONSTRAINT "RecurringLocation_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "RecurringConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecurringAssignments" ADD CONSTRAINT "_RecurringAssignments_A_fkey" FOREIGN KEY ("A") REFERENCES "RecurringConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecurringAssignments" ADD CONSTRAINT "_RecurringAssignments_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
