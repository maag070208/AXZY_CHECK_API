import { Router } from "express";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry } from "./kardex.controller";

const router = Router();

router.post("/", createKardexEntry);
router.get("/", getKardexEntries);
router.get("/:id", getKardexDetail);
router.patch("/:id", updateKardexEntry);

export default router;
