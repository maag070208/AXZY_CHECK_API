import Router from "express";
import { createTrainingMode, deleteTrainingMode, getAllTrainingModes, getTrainingModeById, updateTrainingMode } from "./trainingMode.routes";

const router = Router();

router.get("/", getAllTrainingModes);
router.get("/:id", getTrainingModeById);
router.post("/", createTrainingMode);
router.put("/:id", updateTrainingMode);
router.delete("/:id", deleteTrainingMode);

export default router;
