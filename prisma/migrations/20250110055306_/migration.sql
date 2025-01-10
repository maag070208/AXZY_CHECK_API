/*
  Warnings:

  - A unique constraint covering the columns `[rfc]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Client_rfc_key` ON `Client`(`rfc`);
