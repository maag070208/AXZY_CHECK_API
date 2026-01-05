import { Router } from "express";
import { fileUploadMiddleware } from "@src/core/middlewares/multer.middleware";
import { uploadFile } from "./upload.controller";

const router = Router();

router.post("/", fileUploadMiddleware.single("file"), uploadFile);

export default router;
