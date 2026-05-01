/*
  Warnings:

  - You are about to drop the column `isForRent` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `isInhabited` on the `Property` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('VACANT', 'INHABITED', 'FOR_RENT');

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "isForRent",
DROP COLUMN "isInhabited",
ADD COLUMN     "status" "PropertyStatus" NOT NULL DEFAULT 'VACANT';
