-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATOR', 'USER') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `softDelete` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `aisle` VARCHAR(191) NOT NULL,
    `spot` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isOccupied` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `softDelete` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Location_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehicleEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entryNumber` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `operatorUserId` INTEGER NOT NULL,
    `locationId` INTEGER NOT NULL,
    `entryDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('ACTIVE', 'MOVED', 'EXITED', 'CANCELLED') NOT NULL,
    `notes` VARCHAR(191) NULL,
    `brand` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `plates` VARCHAR(191) NOT NULL,
    `mileage` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `softDelete` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VehicleEntry_entryNumber_key`(`entryNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehiclePhoto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entryId` INTEGER NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehicleMovement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entryId` INTEGER NOT NULL,
    `fromLocationId` INTEGER NOT NULL,
    `toLocationId` INTEGER NOT NULL,
    `assignedUserId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehicleExit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entryId` INTEGER NOT NULL,
    `operatorUserId` INTEGER NOT NULL,
    `exitDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('REQUESTED', 'DELIVERED', 'CANCELLED') NOT NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VehicleExit_entryId_key`(`entryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VehicleEntry` ADD CONSTRAINT `VehicleEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleEntry` ADD CONSTRAINT `VehicleEntry_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleEntry` ADD CONSTRAINT `VehicleEntry_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehiclePhoto` ADD CONSTRAINT `VehiclePhoto_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `VehicleEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleMovement` ADD CONSTRAINT `VehicleMovement_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `VehicleEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleMovement` ADD CONSTRAINT `VehicleMovement_assignedUserId_fkey` FOREIGN KEY (`assignedUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleExit` ADD CONSTRAINT `VehicleExit_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `VehicleEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleExit` ADD CONSTRAINT `VehicleExit_operatorUserId_fkey` FOREIGN KEY (`operatorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
