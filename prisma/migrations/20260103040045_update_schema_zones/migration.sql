-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'LIDER', 'OPERATOR', 'USER') NOT NULL;

-- CreateTable
CREATE TABLE `KeyAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entryId` INTEGER NOT NULL,
    `operatorUserId` INTEGER NOT NULL,
    `type` ENUM('MOVEMENT', 'DELIVERY') NOT NULL,
    `status` ENUM('ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `targetLocationId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `KeyAssignment` ADD CONSTRAINT `KeyAssignment_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `VehicleEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KeyAssignment` ADD CONSTRAINT `KeyAssignment_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KeyAssignment` ADD CONSTRAINT `KeyAssignment_targetLocationId_fkey` FOREIGN KEY (`targetLocationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
