import { Router } from "express";
import * as invitationsController from './invitations.controller';
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createInvitationBody, updateInvitationStatusBody } from "./invitation.schemas";
import { requireAnyPermission } from "@src/modules/common/middlewares/require-permission.middleware";

const router = Router();

// Caseta, jefe y admin usan `invitation.manage`; la residente, sus permisos propios. El controlador
// acota a la residente a sus pases (lista, consulta y solo revocar).
router.post("/datatable", requireAnyPermission("invitation.manage", "invitation.view"), invitationsController.datatable);
router.post("/", requireAnyPermission("invitation.manage", "invitation.create"), validate({ body: createInvitationBody }), invitationsController.create);
router.get("/:id", requireAnyPermission("invitation.manage", "invitation.view"), invitationsController.getOne);
router.put("/:id/status", requireAnyPermission("invitation.manage", "invitation.revoke"), validate({ params: idParam, body: updateInvitationStatusBody }), invitationsController.updateStatus);

export default router;
