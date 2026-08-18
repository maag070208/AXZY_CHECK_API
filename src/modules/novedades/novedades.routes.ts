import { Router } from "express";
import { authenticate } from "../common/middlewares/auth.middleware";
import {
  createNovedadController,
  getNovedadesAblyToken,
  listNovedades,
} from "./novedades.controller";

const router = Router();

router.get("/", authenticate, listNovedades);
router.post("/", authenticate, createNovedadController);
router.get("/ably-token", authenticate, getNovedadesAblyToken);

export default router;
