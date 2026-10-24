import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry, getDataTableKardexEntries, deleteKardexEntry, deleteMedia } from "./kardex.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createKardexBody, updateKardexBody } from "./kardex.schemas";

const router = Router();

router.post("/", authenticate, requirePermission("round.scan"), validate({ body: createKardexBody }), createKardexEntry);
router.get("/", authenticate, requirePermission("kardex.view"), getKardexEntries);
router.get("/:id", authenticate, requirePermission("kardex.view"), getKardexDetail);
router.patch("/:id", authenticate, validate({ params: idParam, body: updateKardexBody }), updateKardexEntry);
router.delete("/:id", authenticate, requirePermission("kardex.delete"), deleteKardexEntry);
router.delete("/:id/media", authenticate, requirePermission("kardex.delete"), deleteMedia);
router.post("/datatable", authenticate, requirePermission("kardex.view"), getDataTableKardexEntries);

export default router;
