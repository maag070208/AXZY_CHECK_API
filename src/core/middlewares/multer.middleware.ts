import multer from "multer";
import { AppError } from "@src/core/errors/app-error";
import { ALLOWED_MEDIA_TYPES } from "@src/core/constants/media";

// Ensure upload directory exists
// Storage configuration
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes: readonly string[] = ALLOWED_MEDIA_TYPES;

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("FILE_TYPE_INVALID", "Tipo de archivo no permitido: solo imágenes y videos.", 400), false);
  }
};


export const fileUploadMiddleware = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});
