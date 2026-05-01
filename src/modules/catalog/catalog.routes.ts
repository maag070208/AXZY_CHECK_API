import { Router } from "express";
import * as catalogController from './catalog.controller';

const router = Router();

router.get("/:key", catalogController.getCatalog);

export default router;
