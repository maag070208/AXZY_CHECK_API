import { Router } from "express";
import { fileUploadMiddleware } from "@src/core/middlewares/multer.middleware";
import { uploadFile } from "./upload.controller";
import { authenticate } from "./middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, fileUploadMiddleware.single("file"), uploadFile);

export default router;
