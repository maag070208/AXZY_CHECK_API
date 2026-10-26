-- Fase 2A: padrón de vehículos, tags y acceso manual en caseta.
-- Rollback: ALTER TABLE "AccessEvent" DROP CONSTRAINT "AccessEvent_vehicleId_fkey"; DROP INDEX "AccessEvent_vehicleId_idx"; ALTER TABLE "AccessEvent" DROP COLUMN "vehicleId"; DROP TABLE "Vehicle"; DROP TYPE "VehicleStatus";
CREATE TYPE "VehicleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'INACTIVE');

CREATE TABLE "Vehicle" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "plate" TEXT NOT NULL,
    "plateNormalized" TEXT NOT NULL,
    "tagCode" TEXT,
    "kind" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "color" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vehicle_tagCode_key" ON "Vehicle"("tagCode");
CREATE UNIQUE INDEX "Vehicle_propertyId_plateNormalized_key" ON "Vehicle"("propertyId", "plateNormalized");
CREATE INDEX "Vehicle_plateNormalized_idx" ON "Vehicle"("plateNormalized");
CREATE INDEX "Vehicle_propertyId_status_idx" ON "Vehicle"("propertyId", "status");

ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessEvent" ADD COLUMN "vehicleId" INTEGER;
CREATE INDEX "AccessEvent_vehicleId_idx" ON "AccessEvent"("vehicleId");
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
