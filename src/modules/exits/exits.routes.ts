import { Router } from "express";
import { addExit, getExits } from "./exits.controller";

const router = Router();

router.get("/", getExits);
router.post("/", addExit);

export default router;
