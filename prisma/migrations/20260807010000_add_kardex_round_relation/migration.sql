-- AlterTable
ALTER TABLE "Kardex" ADD COLUMN     "roundId" INTEGER;

-- CreateIndex
CREATE INDEX "Kardex_roundId_idx" ON "Kardex"("roundId");

-- AddForeignKey
ALTER TABLE "Kardex" ADD CONSTRAINT "Kardex_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;
