import { apiMeta, helloWorld } from "@src/modules/index.controller";
import express from "express";

const router = express.Router();

router.get("/", helloWorld);
router.get("/meta", apiMeta);

export default router;
