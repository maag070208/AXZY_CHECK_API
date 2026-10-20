import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry, getDataTableKardexEntries, deleteKardexEntry, deleteMedia } from "./kardex.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, createKardexEntry);
router.get("/", authenticate, getKardexEntries);
router.get("/:id", authenticate, getKardexDetail);
router.patch("/:id", authenticate, updateKardexEntry);
router.delete("/:id", requirePermission("kardex.manage"), authenticate, deleteKardexEntry);
router.delete("/:id/media", requirePermission("kardex.manage"), authenticate, deleteMedia);
router.post("/datatable", authenticate, getDataTableKardexEntries);

export default router;
