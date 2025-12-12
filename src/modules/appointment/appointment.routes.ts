import Router from "express";
import {
  getAllAppointments,
  getAppointmentById,
  createAppointment,
  deleteAppointment,
  getAppointmentsByDate,
  getAppointmentsBySchedule,
  getAppointmentsByChild,
  getAppointmentsByMode,
  getAppointmentsByUser,
} from "./appointment.controller";

const router = Router();

// CRUD
router.get("/", getAllAppointments);
router.get("/:id", getAppointmentById);
router.post("/", createAppointment);
router.delete("/:id", deleteAppointment);

// Filters
router.get("/user/:userId", getAppointmentsByUser); // NEW
router.get("/date/:date", getAppointmentsByDate);
router.get("/schedule/:scheduleId", getAppointmentsBySchedule);
router.get("/child/:childName", getAppointmentsByChild);
router.get("/mode/:modeId", getAppointmentsByMode);

export default router;
