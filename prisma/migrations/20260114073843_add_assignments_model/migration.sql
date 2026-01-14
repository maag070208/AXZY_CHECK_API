-- AlterTable
ALTER TABLE `Kardex` ADD COLUMN `assignmentId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guardId` INTEGER NOT NULL,
    `locationId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'CHECKING', 'UNDER_REVIEW', 'REVIEWED', 'ANOMALY') NOT NULL DEFAULT 'PENDING',
    `assignedBy` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Assignment_guardId_idx`(`guardId`),
    INDEX `Assignment_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Kardex` ADD CONSTRAINT `Kardex_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_guardId_fkey` FOREIGN KEY (`guardId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
