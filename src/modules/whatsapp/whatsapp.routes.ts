import express from "express";
import { sendMail } from "./mail.controller";

const router = express.Router();

router.post("/", sendMail);

export default router;
