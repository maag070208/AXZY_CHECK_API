-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "recurringConfigurationId" INTEGER;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_recurringConfigurationId_fkey" FOREIGN KEY ("recurringConfigurationId") REFERENCES "RecurringConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
