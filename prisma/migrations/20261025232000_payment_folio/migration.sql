-- Módulo 13 fase 4: folio consecutivo y secuencia de documentos para recibos.
-- Rollback: DROP TABLE "DocumentSequence"; DROP INDEX "Payment_folio_key"; ALTER TABLE "Payment" DROP COLUMN "folio";
ALTER TABLE "Payment" ADD COLUMN "folio" INTEGER;
CREATE UNIQUE INDEX "Payment_folio_key" ON "Payment"("folio");
CREATE TABLE "DocumentSequence" (
    "key" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("key")
);
