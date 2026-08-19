-- Verificación de Cambio de Turno (RF-01..05).
CREATE TYPE "ShiftType" AS ENUM ('MATUTINO', 'NOCTURNO');

CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'COMPLETED', 'SIGNED');

CREATE TABLE "ShiftCheck" (
    "id" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "actualEntryAt" TIMESTAMP(3),
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "uniformCheck" JSONB,
    "handoverItems" JSONB,
    "observations" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" INTEGER NOT NULL,
    "signedById" INTEGER,
    "signedAt" TIMESTAMP(3),
    "deliveredById" INTEGER,
    "receivedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftCheck_clientRef_key" ON "ShiftCheck"("clientRef");

CREATE INDEX "ShiftCheck_userId_shiftDate_idx" ON "ShiftCheck"("userId", "shiftDate");
CREATE INDEX "ShiftCheck_shiftDate_shiftType_idx" ON "ShiftCheck"("shiftDate", "shiftType");
CREATE INDEX "ShiftCheck_createdById_idx" ON "ShiftCheck"("createdById");

ALTER TABLE "ShiftCheck" ADD CONSTRAINT "ShiftCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftCheck" ADD CONSTRAINT "ShiftCheck_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftCheck" ADD CONSTRAINT "ShiftCheck_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftCheck" ADD CONSTRAINT "ShiftCheck_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftCheck" ADD CONSTRAINT "ShiftCheck_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
