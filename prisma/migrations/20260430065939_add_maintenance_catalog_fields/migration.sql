-- AlterTable
ALTER TABLE "Maintenance" ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "typeId" INTEGER,
ALTER COLUMN "category" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IncidentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "IncidentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
