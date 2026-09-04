-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MATUTINO', 'NOCTURNO');

-- CreateTable
CREATE TABLE "ShiftHandover" (
    "id" SERIAL NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "handoverDate" DATE NOT NULL,
    "credentialsCount" INTEGER,
    "tarjetonesCount" INTEGER,
    "novedades" TEXT,
    "checklistPhones" BOOLEAN NOT NULL DEFAULT false,
    "checklistTablet" BOOLEAN NOT NULL DEFAULT false,
    "checklistRadios" BOOLEAN NOT NULL DEFAULT false,
    "checklistKeys" BOOLEAN NOT NULL DEFAULT false,
    "checklistLogbook" BOOLEAN NOT NULL DEFAULT false,
    "checklistConsignas" BOOLEAN NOT NULL DEFAULT false,
    "reportedToAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoverElement" (
    "id" SERIAL NOT NULL,
    "shiftHandoverId" INTEGER NOT NULL,
    "guardId" INTEGER NOT NULL,
    "entryTime" TEXT NOT NULL,
    "punctual" BOOLEAN NOT NULL DEFAULT true,
    "observations" TEXT,

    CONSTRAINT "ShiftHandoverElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftHandover_handoverDate_idx" ON "ShiftHandover"("handoverDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftHandover_shiftType_handoverDate_key" ON "ShiftHandover"("shiftType", "handoverDate");

-- CreateIndex
CREATE INDEX "ShiftHandoverElement_shiftHandoverId_idx" ON "ShiftHandoverElement"("shiftHandoverId");

-- CreateIndex
CREATE INDEX "ShiftHandoverElement_guardId_idx" ON "ShiftHandoverElement"("guardId");

-- AddForeignKey
ALTER TABLE "ShiftHandover" ADD CONSTRAINT "ShiftHandover_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverElement" ADD CONSTRAINT "ShiftHandoverElement_shiftHandoverId_fkey" FOREIGN KEY ("shiftHandoverId") REFERENCES "ShiftHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverElement" ADD CONSTRAINT "ShiftHandoverElement_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
