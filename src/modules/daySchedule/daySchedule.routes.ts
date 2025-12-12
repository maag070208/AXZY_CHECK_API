import Router from "express";
import {
  getAllSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedulesByDate,
  getSchedulesByMode,
  getSchedulesToday,
  getSchedulesWeek,
  getAvailableSchedules,
} from "./daySchedule.controller";

const router = Router();

router.get("/", getAllSchedules);
router.get("/today", getSchedulesToday);
router.get("/week", getSchedulesWeek);
router.get("/available", getAvailableSchedules);
router.get("/date/:date", getSchedulesByDate);
router.get("/mode/:id", getSchedulesByMode);
router.get("/:id", getScheduleById);
router.post("/", createSchedule);
router.put("/:id", updateSchedule);
router.delete("/:id", deleteSchedule);

export default router;
