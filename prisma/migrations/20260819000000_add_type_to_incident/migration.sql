-- Add discriminator column to Incident to separate Casa Club records from regular incidents.
-- Named "kind" to avoid conflict with the "type" relation field (IncidentType).
ALTER TABLE "Incident" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INCIDENT';
