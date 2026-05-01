import { Router } from "express";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry, getDataTableKardexEntries, deleteKardexEntry, deleteMedia } from "./kardex.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, createKardexEntry);
router.get("/", authenticate, getKardexEntries);
router.get("/:id", authenticate, getKardexDetail);
router.patch("/:id", authenticate, updateKardexEntry);
router.delete("/:id", authenticate, deleteKardexEntry);
router.delete("/:id/media", authenticate, deleteMedia);
router.post("/datatable", authenticate, getDataTableKardexEntries);

export default router;
