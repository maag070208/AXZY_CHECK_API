import { Router } from "express";
import { pull } from "./sync.controller";

const router = Router();
router.get("/pull", pull);
export default router;
