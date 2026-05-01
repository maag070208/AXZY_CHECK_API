import { Router } from "express";
import * as invitationsController from './invitations.controller';

const router = Router();

router.post("/datatable", invitationsController.datatable);
router.post("/", invitationsController.create);
router.get("/:id", invitationsController.getOne);
router.put("/:id/status", invitationsController.updateStatus);

export default router;
