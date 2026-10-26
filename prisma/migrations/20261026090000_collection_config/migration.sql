-- Cobranza configurable: periodicidad, vencimiento, días de gracia y recargos.
-- Rollback: DROP TABLE "CollectionConfig"; DROP TYPE "LateFeeType"; DROP TYPE "CollectionFrequency";
--           ALTER TABLE "Charge" DROP CONSTRAINT "Charge_sourceChargeId_fkey"; DROP INDEX "Charge_sourceChargeId_key";
--           ALTER TABLE "Charge" DROP COLUMN "sourceChargeId"; (no se puede quitar RECARGO del enum sin recrearlo)
ALTER TYPE "ChargeCategory" ADD VALUE IF NOT EXISTS 'RECARGO';

CREATE TYPE "CollectionFrequency" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'FOUR_MONTHLY', 'SEMIANNUAL', 'ANNUAL');
CREATE TYPE "LateFeeType" AS ENUM ('NONE', 'FIXED', 'PERCENT');

CREATE TABLE "CollectionConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "concept" TEXT NOT NULL DEFAULT 'Cuota de mantenimiento',
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" "CollectionFrequency" NOT NULL DEFAULT 'MONTHLY',
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "nextChargeDate" DATE NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 5,
    "lateFeeType" "LateFeeType" NOT NULL DEFAULT 'NONE',
    "lateFeeValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollectionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionConfig_propertyId_key" ON "CollectionConfig"("propertyId");
ALTER TABLE "CollectionConfig" ADD CONSTRAINT "CollectionConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Charge" ADD COLUMN "sourceChargeId" INTEGER;
CREATE UNIQUE INDEX "Charge_sourceChargeId_key" ON "Charge"("sourceChargeId");
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_sourceChargeId_fkey" FOREIGN KEY ("sourceChargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
