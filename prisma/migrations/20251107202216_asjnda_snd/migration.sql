/*
  Warnings:

  - You are about to drop the column `studentName` on the `Appointment` table. All the data in the column will be lost.
  - Added the required column `childId` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Appointment` DROP COLUMN `studentName`,
    ADD COLUMN `childId` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `Child` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `birthDate` DATETIME(3) NULL,
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_childId_fkey` FOREIGN KEY (`childId`) REFERENCES `Child`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Child` ADD CONSTRAINT `Child_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
