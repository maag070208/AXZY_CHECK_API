import { Router } from "express";
import { addLocation, getLocations, putLocation, removeLocation, getDataTable } from "./locations.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getLocations);
router.post("/", addLocation);
router.put("/:id", putLocation);
router.delete("/:id", removeLocation);

export default router;
