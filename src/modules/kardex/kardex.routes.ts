import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { createKardexEntry, getKardexEntries, getKardexDetail, updateKardexEntry, getDataTableKardexEntries, deleteKardexEntry, deleteMedia } from "./kardex.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createKardexBody, updateKardexBody } from "./kardex.schemas";

const router = Router();

router.post("/", authenticate, validate({ body: createKardexBody }), createKardexEntry);
router.get("/", authenticate, getKardexEntries);
router.get("/:id", authenticate, getKardexDetail);
router.patch("/:id", authenticate, validate({ params: idParam, body: updateKardexBody }), updateKardexEntry);
router.delete("/:id", requirePermission("kardex.manage"), authenticate, deleteKardexEntry);
router.delete("/:id/media", requirePermission("kardex.manage"), authenticate, deleteMedia);
router.post("/datatable", authenticate, getDataTableKardexEntries);

export default router;
