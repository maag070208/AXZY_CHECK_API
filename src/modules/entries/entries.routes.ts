import { Router } from "express";
import { addEntry, getEntries, getEntry, getLatestUserEntry, getUserVehicles } from "./entries.controller";
import { fileUploadMiddleware } from "@src/core/middlewares/multer.middleware";

const router = Router();

router.get("/", getEntries);
router.get("/user/:userId/latest", getLatestUserEntry);
router.get("/user/:userId/vehicles", getUserVehicles);
router.get("/:id", getEntry);
router.post("/", 
    fileUploadMiddleware.fields([
        { name: 'photo_frontal', maxCount: 1 },
        { name: 'photo_trasera', maxCount: 1 },
        { name: 'photo_lateral_derecho', maxCount: 1 },
        { name: 'photo_lateral_izquierdo', maxCount: 1 },
        { name: 'photo_interior', maxCount: 1 },
        { name: 'photo_extras', maxCount: 1 }
    ]), 
    addEntry
);

export default router;
