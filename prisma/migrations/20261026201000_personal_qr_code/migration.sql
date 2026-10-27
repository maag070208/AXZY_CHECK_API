-- Código corto rotativo para el pase QR personal (se guarda solo el hash).
ALTER TABLE "PersonalQrPass" ADD COLUMN "codeHash" TEXT;
ALTER TABLE "PersonalQrPass" ADD COLUMN "codeExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PersonalQrPass_codeHash_key" ON "PersonalQrPass"("codeHash");
