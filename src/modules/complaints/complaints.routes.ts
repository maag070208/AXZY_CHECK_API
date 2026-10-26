import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { authenticate } from "../common/middlewares/auth.middleware";
import * as complaintController from "./complaints.controller";
import { addComplaintMessageBody, changeComplaintStatusBody, createComplaintBody, listComplaintsQuery } from "./complaints.schemas";

const router = Router();

// El residente tiene complaint.view/create y solo ve las suyas (filtrado en el servicio).
router.get("/", authenticate, requirePermission("complaint.view"), validate({ query: listComplaintsQuery }), complaintController.listComplaints);
router.post("/", authenticate, requirePermission("complaint.create"), validate({ body: createComplaintBody }), complaintController.createComplaint);
router.get("/:id", authenticate, requirePermission("complaint.view"), validate({ params: idParam }), complaintController.getComplaint);
router.post("/:id/messages", authenticate, requirePermission("complaint.view"), validate({ params: idParam, body: addComplaintMessageBody }), complaintController.addComplaintMessage);
router.patch("/:id/status", authenticate, requirePermission("complaint.view"), validate({ params: idParam, body: changeComplaintStatusBody }), complaintController.changeComplaintStatus);
// Reapertura del residente (solo su propia queja RESOLVED, dentro de 7 días).
router.post("/:id/reopen", authenticate, requirePermission("complaint.view"), validate({ params: idParam }), complaintController.reopenComplaint);

export default router;
