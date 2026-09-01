-- Add discriminator column to Incident to separate Casa Club records from regular incidents.
-- Named "kind" to avoid conflict with the "type" relation field (IncidentType).
ALTER TABLE "Incident" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'INCIDENT';
ALTER TABLE "Incident" ADD COLUMN "clientRef" TEXT;
CREATE UNIQUE INDEX "Incident_clientRef_key" ON "Incident"("clientRef");
