-- Fase 2A: regla de morosos, excepciones y bitácora base de accesos.
-- Rollback: DROP TABLE "AccessEvent"; DROP TABLE "AccessException"; DROP TABLE "DelinquencyRule";
--           DROP TYPE "AccessDecision"; DROP TYPE "AccessSource"; DROP TYPE "AccessDirection"; DROP TYPE "AccessMethod";
CREATE TYPE "AccessMethod" AS ENUM ('QR', 'TAG', 'PIN', 'MANUAL');
CREATE TYPE "AccessDirection" AS ENUM ('ENTRY', 'EXIT');
CREATE TYPE "AccessSource" AS ENUM ('GUARD', 'DEVICE');
CREATE TYPE "AccessDecision" AS ENUM ('ALLOWED', 'DENIED');

CREATE TABLE "DelinquencyRule" (
    "id" SERIAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minOverdueDays" INTEGER NOT NULL DEFAULT 30,
    "blockVisitors" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DelinquencyRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessException" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessException_propertyId_validUntil_idx" ON "AccessException"("propertyId", "validUntil");

CREATE TABLE "AccessEvent" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "personId" INTEGER,
    "invitationId" INTEGER,
    "method" "AccessMethod" NOT NULL,
    "direction" "AccessDirection" NOT NULL,
    "source" "AccessSource" NOT NULL DEFAULT 'GUARD',
    "decision" "AccessDecision" NOT NULL,
    "reason" TEXT,
    "guardId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessEvent_propertyId_occurredAt_idx" ON "AccessEvent"("propertyId", "occurredAt");
CREATE INDEX "AccessEvent_personId_occurredAt_idx" ON "AccessEvent"("personId", "occurredAt");
CREATE INDEX "AccessEvent_invitationId_idx" ON "AccessEvent"("invitationId");

ALTER TABLE "DelinquencyRule" ADD CONSTRAINT "DelinquencyRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessException" ADD CONSTRAINT "AccessException_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessException" ADD CONSTRAINT "AccessException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
