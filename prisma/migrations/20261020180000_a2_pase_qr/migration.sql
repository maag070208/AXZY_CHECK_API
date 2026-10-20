-- AlterTable
ALTER TABLE "PropertyAuthorization" ADD COLUMN     "passHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAuthorization_passHash_key" ON "PropertyAuthorization"("passHash");

