import { Router } from "express";
import * as invitationsController from './invitations.controller';
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requireAnyPermission, requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { approvalBody, createInvitationBody, updateInvitationStatusBody, visitStatsQuery } from "./invitation.schemas";

const router = Router();

// Caseta, jefe y admin usan `invitation.manage`; la residente, sus permisos propios. El controlador
// acota a la residente a sus pases (lista, consulta y solo revocar).
router.post("/datatable", requireAnyPermission("invitation.manage", "invitation.view"), invitationsController.datatable);
router.post("/", requireAnyPermission("invitation.manage", "invitation.create"), validate({ body: createInvitationBody }), invitationsController.create);

// Rutas fijas antes de `/:id`, para que no se confundan con un id.
router.get("/pending-approvals", requireAnyPermission("invitation.approve"), invitationsController.pendingApprovals);
router.get("/caseta-status", requirePermission("invitation.manage"), invitationsController.casetaStatus);
router.get("/stats", requirePermission("access.event.view"), validate({ query: visitStatsQuery }), invitationsController.stats);

router.get("/:id", requireAnyPermission("invitation.manage", "invitation.view"), invitationsController.getOne);
router.put("/:id/status", requireAnyPermission("invitation.manage", "invitation.revoke"), validate({ params: idParam, body: updateInvitationStatusBody }), invitationsController.updateStatus);
router.put("/:id/approval", requireAnyPermission("invitation.approve"), validate({ params: idParam, body: approvalBody }), invitationsController.decideApproval);

export default router;
