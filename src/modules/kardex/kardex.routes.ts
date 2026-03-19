import { Router } from "express";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry, getDataTableKardexEntries } from "./kardex.controller";

const router = Router();

router.post("/", createKardexEntry);
router.get("/", getKardexEntries);
router.get("/:id", getKardexDetail);
router.patch("/:id", updateKardexEntry);
router.post("/datatable", getDataTableKardexEntries);

export default router;
