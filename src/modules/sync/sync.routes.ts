import { Router } from "express";
import { authenticate } from "../common/middlewares/auth.middleware";
import { getBootstrap, getChangelog } from "./sync.controller";

const router = Router();

router.use(authenticate);

router.get("/bootstrap", getBootstrap);
router.get("/changelog", getChangelog);

export default router;
