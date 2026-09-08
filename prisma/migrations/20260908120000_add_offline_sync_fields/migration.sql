-- Offline-first sync support: idempotency keys (clientRef) and server-receipt
-- timestamps (syncedAt) for the four guard-facing flows (Ronda/Incidencia/
-- Mantenimiento/Casa Club -> Round, Incident, Maintenance, Kardex), plus an
-- explicit Round<->Kardex link so scans registered offline can be tied to
-- their round without relying on time-window heuristics.

-- AlterTable: Round
ALTER TABLE "Round" ADD COLUMN "clientRef" TEXT;
ALTER TABLE "Round" ADD COLUMN "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Round_clientRef_key" ON "Round"("clientRef");

-- AlterTable: Incident (clientRef ya existe desde una migración previa)
ALTER TABLE "Incident" ADD COLUMN "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: Maintenance
ALTER TABLE "Maintenance" ADD COLUMN "clientRef" TEXT;
ALTER TABLE "Maintenance" ADD COLUMN "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Maintenance_clientRef_key" ON "Maintenance"("clientRef");

-- AlterTable: Kardex
ALTER TABLE "Kardex" ADD COLUMN "roundId" INTEGER;
ALTER TABLE "Kardex" ADD COLUMN "clientRef" TEXT;
ALTER TABLE "Kardex" ADD COLUMN "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Kardex_clientRef_key" ON "Kardex"("clientRef");

-- CreateIndex
CREATE INDEX "Kardex_roundId_idx" ON "Kardex"("roundId");

-- AddForeignKey
ALTER TABLE "Kardex" ADD CONSTRAINT "Kardex_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;
