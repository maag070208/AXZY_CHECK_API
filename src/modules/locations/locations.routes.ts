import { Router } from "express";
import { addLocation, getLocations, putLocation, removeLocation } from "./locations.controller";

const router = Router();

router.get("/", getLocations);
router.post("/", addLocation);
router.put("/:id", putLocation);
router.delete("/:id", removeLocation);

export default router;
