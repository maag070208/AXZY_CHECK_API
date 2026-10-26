-- Fase 2A: clave peatonal por PIN (hash HMAC, sin texto plano).
-- Rollback: DROP TABLE "AccessPin";
CREATE TABLE "AccessPin" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "pinHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccessPin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessPin_pinHash_key" ON "AccessPin"("pinHash");
CREATE INDEX "AccessPin_propertyId_active_idx" ON "AccessPin"("propertyId", "active");
CREATE INDEX "AccessPin_userId_active_idx" ON "AccessPin"("userId", "active");

ALTER TABLE "AccessPin" ADD CONSTRAINT "AccessPin_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessPin" ADD CONSTRAINT "AccessPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessPin" ADD CONSTRAINT "AccessPin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
