import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import {
  getCollectionConfigs,
  postApplyLateFees,
  postCollectionConfig,
  postGenerateCharges,
  putCollectionConfig,
} from "./collections.controller";
import {
  applyLateFeesBody,
  collectionConfigBody,
  generateCollectionBody,
  updateCollectionConfigBody,
} from "./collections.schemas";

const router = Router();

router.get("/configs", requirePermission("charge.view"), getCollectionConfigs);
router.post("/configs", requirePermission("charge.manage"), validate({ body: collectionConfigBody }), postCollectionConfig);
router.put(
  "/configs/:id",
  requirePermission("charge.manage"),
  validate({ params: idParam, body: updateCollectionConfigBody }),
  putCollectionConfig,
);
router.post("/generate", requirePermission("charge.manage"), validate({ body: generateCollectionBody }), postGenerateCharges);
router.post("/apply-late-fees", requirePermission("charge.manage"), validate({ body: applyLateFeesBody }), postApplyLateFees);

export default router;
