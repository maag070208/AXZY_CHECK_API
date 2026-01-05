import { Router } from "express";
import { addMovement, downloadKardexPdf, getKardexLog, getMovements } from "./movements.controller";

const router = Router();

router.get("/kardex/pdf", downloadKardexPdf);
router.get("/kardex", getKardexLog);
router.get("/", getMovements);
router.post("/", addMovement);

export default router;
