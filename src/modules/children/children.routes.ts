import Router from "express";
import {
  getChildrenByUser,
  createChild,
  deleteChild,
  getAllChildren,
  getChildById,
  updateChild,
  assignAppointment,
} from "./children.controller";

const router = Router();

router.get("/", getAllChildren);
router.get("/user/:userId", getChildrenByUser);
router.get("/:id", getChildById);
router.post("/", createChild);
router.post("/assign", assignAppointment);
router.put("/:id", updateChild);
router.delete("/:id", deleteChild);

export default router;
