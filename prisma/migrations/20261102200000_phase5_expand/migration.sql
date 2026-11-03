-- Multicliente, fase 5 (expandir): `clientId` propio en las tablas que todavía llegaban al cliente por vínculos
-- (Person, Maintenance, ChatMessage, ShiftHandover) o por la propiedad (AccessPin, Vehicle), y únicos por cliente
-- donde antes había únicos globales (AccessPin.pinHash, Vehicle.tagCode, ShiftHandover shiftType+handoverDate).
-- Las columnas quedan NULLABLE: el NOT NULL va en la migración de contracción de la fase 5, cuando todas las
-- escrituras de la API ya asignen el cliente. Rollback: scripts/multi-tenant/rollback-phase5-expand.sql.
-- Verificación posterior a la contracción: scripts/multi-tenant/verify-phase5.sql.

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "clientId" INTEGER;
ALTER TABLE "Maintenance" ADD COLUMN "clientId" INTEGER;
ALTER TABLE "AccessPin" ADD COLUMN "clientId" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN "clientId" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN "clientId" INTEGER;
ALTER TABLE "ShiftHandover" ADD COLUMN "clientId" INTEGER;

-- DropIndex (los reemplazan índices compuestos por cliente)
DROP INDEX "ChatMessage_createdAt_idx";
DROP INDEX "ShiftHandover_handoverDate_idx";

-- CreateIndex
CREATE INDEX "Person_clientId_idx" ON "Person"("clientId");
CREATE INDEX "Maintenance_clientId_createdAt_idx" ON "Maintenance"("clientId", "createdAt" DESC);
CREATE INDEX "AccessPin_clientId_idx" ON "AccessPin"("clientId");
CREATE INDEX "Vehicle_clientId_idx" ON "Vehicle"("clientId");
CREATE INDEX "ChatMessage_clientId_createdAt_idx" ON "ChatMessage"("clientId", "createdAt" DESC);
CREATE INDEX "ShiftHandover_clientId_handoverDate_idx" ON "ShiftHandover"("clientId", "handoverDate");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessPin" ADD CONSTRAINT "AccessPin_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftHandover" ADD CONSTRAINT "ShiftHandover_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Únicos por cliente: el PIN y el tag dejan de filtrar la existencia en otro cliente.
DROP INDEX "AccessPin_pinHash_key";
CREATE UNIQUE INDEX "AccessPin_clientId_pinHash_key" ON "AccessPin"("clientId", "pinHash");

DROP INDEX "Vehicle_tagCode_key";
CREATE UNIQUE INDEX "Vehicle_clientId_tagCode_key" ON "Vehicle"("clientId", "tagCode");

-- La entrega de turno pasa a ser única POR CLIENTE y fecha.
DROP INDEX "ShiftHandover_shiftType_handoverDate_key";
CREATE UNIQUE INDEX "ShiftHandover_clientId_shiftType_handoverDate_key" ON "ShiftHandover"("clientId", "shiftType", "handoverDate");
