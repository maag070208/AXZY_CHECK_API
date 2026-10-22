-- Offline sync: idempotencia por clientRef y asociación de kardex a ronda.

ALTER TABLE "Round" ADD COLUMN "clientRef" TEXT;
CREATE UNIQUE INDEX "Round_clientRef_key" ON "Round"("clientRef");

ALTER TABLE "Kardex" ADD COLUMN "clientRef" TEXT;
ALTER TABLE "Kardex" ADD COLUMN "roundId" INTEGER;
CREATE UNIQUE INDEX "Kardex_clientRef_key" ON "Kardex"("clientRef");
CREATE INDEX "Kardex_roundId_idx" ON "Kardex"("roundId");
ALTER TABLE "Kardex"
  ADD CONSTRAINT "Kardex_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Maintenance" ADD COLUMN "clientRef" TEXT;
CREATE UNIQUE INDEX "Maintenance_clientRef_key" ON "Maintenance"("clientRef");
