-- Motivo y autor de la revocación del pase, para mostrarlo en el detalle.
ALTER TABLE "Invitation"
  ADD COLUMN "revokedReason" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" INTEGER;
