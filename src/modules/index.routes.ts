import { helloWorld } from "@src/modules/index.controller";
import express from "express";

const router = express.Router();

router.get("/", helloWorld);

export default router;
