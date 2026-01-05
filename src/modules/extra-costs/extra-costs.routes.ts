import { Router } from "express";
import { addExtraCost, getEntryExtraCosts } from "./extra-costs.controller";

const router = Router();

router.post("/", addExtraCost);
router.get("/entry/:entryId", getEntryExtraCosts);

export default router;
