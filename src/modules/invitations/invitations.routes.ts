import { Router } from "express";
import * as invitationsController from './invitations.controller';
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createInvitationBody, updateInvitationStatusBody } from "./invitation.schemas";

const router = Router();

router.post("/datatable", invitationsController.datatable);
router.post("/", validate({ body: createInvitationBody }), invitationsController.create);
router.get("/:id", invitationsController.getOne);
router.put("/:id/status", validate({ params: idParam, body: updateInvitationStatusBody }), invitationsController.updateStatus);

export default router;
