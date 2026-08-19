CREATE TYPE "IncidentSeverity" AS ENUM ('LEVE', 'REINCIDENTE', 'GRAVE');

ALTER TABLE "Incident"
    ADD COLUMN "severity" "IncidentSeverity" NOT NULL DEFAULT 'LEVE',
    ADD COLUMN "replacedById" INTEGER,
    ADD COLUMN "coverageStart" TIMESTAMP(3),
    ADD COLUMN "coverageEnd" TIMESTAMP(3);

CREATE INDEX "Incident_replacedById_idx" ON "Incident"("replacedById");

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_replacedById_fkey"
    FOREIGN KEY ("replacedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
