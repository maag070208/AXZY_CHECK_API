import { Router } from "express";
import { fileUploadMiddleware } from "@src/core/middlewares/multer.middleware";
import { uploadFile } from "./upload.controller";
import validationMiddleware from "@src/core/middlewares/token-validator.middleware";

const router = Router();

router.post("/", validationMiddleware, fileUploadMiddleware.single("file"), uploadFile);

export default router;
