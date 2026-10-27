-- Pase QR personal del residente (token firmado de 60 s, revocable).
CREATE TABLE "PersonalQrPass" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonalQrPass_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PersonalQrPass_userId_active_idx" ON "PersonalQrPass"("userId", "active");
CREATE INDEX "PersonalQrPass_propertyId_active_idx" ON "PersonalQrPass"("propertyId", "active");

ALTER TABLE "PersonalQrPass" ADD CONSTRAINT "PersonalQrPass_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalQrPass" ADD CONSTRAINT "PersonalQrPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
