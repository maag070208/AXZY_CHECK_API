import { Router } from "express";
import * as clubController from "./club.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, clubController.createClub);
router.post("/datatable", clubController.getDataTable);
router.get("/", authenticate, clubController.getClubs);
router.get("/pending-count", authenticate, clubController.getPendingCount);
router.put("/:id/resolve", authenticate, clubController.resolveClub);
router.delete("/:id", authenticate, clubController.deleteClub);
router.delete("/:id/media", authenticate, clubController.deleteMedia);

export default router;
