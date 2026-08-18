-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "clientRef" TEXT;

-- AlterTable
ALTER TABLE "Kardex" ADD COLUMN "clientRef" TEXT;

-- AlterTable
ALTER TABLE "Maintenance" ADD COLUMN "clientRef" TEXT;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN "clientRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Incident_clientRef_key" ON "Incident"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "Kardex_clientRef_key" ON "Kardex"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "Maintenance_clientRef_key" ON "Maintenance"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "Round_clientRef_key" ON "Round"("clientRef");
