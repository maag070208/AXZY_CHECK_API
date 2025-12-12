/*
  Warnings:

  - A unique constraint covering the columns `[date,startTime,endTime]` on the table `DaySchedule` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `TrainingMode` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `DaySchedule_date_startTime_endTime_key` ON `DaySchedule`(`date`, `startTime`, `endTime`);

-- CreateIndex
CREATE UNIQUE INDEX `TrainingMode_name_key` ON `TrainingMode`(`name`);
