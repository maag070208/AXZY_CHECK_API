-- Módulo 13 fase 5: vínculo opcional de una incidencia con una propiedad para el kardex del residente.
-- Aditiva. Rollback: ALTER TABLE "Incident" DROP CONSTRAINT "Incident_propertyId_fkey";
--                       DROP INDEX "Incident_propertyId_createdAt_idx"; ALTER TABLE "Incident" DROP COLUMN "propertyId";
ALTER TABLE "Incident" ADD COLUMN "propertyId" INTEGER;
CREATE INDEX "Incident_propertyId_createdAt_idx" ON "Incident"("propertyId", "createdAt" DESC);
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
