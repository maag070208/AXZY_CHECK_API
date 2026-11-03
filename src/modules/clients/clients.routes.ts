import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { createClientBody, updateClientBody } from "./clients.schemas";
import { create, list, patch } from "./clients.controller";

const router = Router();

router.get("/", requirePermission("client.view"), list);
router.post("/", requirePermission("client.manage"), validate({ body: createClientBody }), create);
router.patch("/:id", requirePermission("client.manage"), validate({ params: idParam, body: updateClientBody }), patch);

export default router;
