import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry, getDataTableKardexEntries, deleteKardexEntry, deleteMedia } from "./kardex.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, createKardexEntry);
router.get("/", authenticate, getKardexEntries);
router.get("/:id", authenticate, getKardexDetail);
router.patch("/:id", authenticate, updateKardexEntry);
router.delete("/:id", requireRole(["ADMIN", "SHIFT"]), authenticate, deleteKardexEntry);
router.delete("/:id/media", requireRole(["ADMIN", "SHIFT"]), authenticate, deleteMedia);
router.post("/datatable", authenticate, getDataTableKardexEntries);

export default router;
