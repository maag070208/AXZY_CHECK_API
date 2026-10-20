import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { ALLOWED_MEDIA_TYPES, MEDIA_MAX_BYTES } from "@src/core/constants/media";
import { confirmMedia, presignMedia } from "./media.service";

const router = Router();

const presignBody = z.object({
  contentType: z.enum(ALLOWED_MEDIA_TYPES),
  sizeBytes: z.number().int().positive().max(MEDIA_MAX_BYTES),
  // Documentos de personas se suben privados: sin URL pública (T-A2-07).
  isPrivate: z.boolean().optional(),
});

// La identidad viene solo del token (req.user, puesto por authenticate en el guard global).
router.post("/presign", validate({ body: presignBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await presignMedia(req.user!.id, req.body);
    return res.status(201).json(createTResult(result));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/confirm", validate({ params: idParam }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await confirmMedia(req.user!.id, Number(req.params.id));
    return res.status(200).json(createTResult(result));
  } catch (error) {
    return next(error);
  }
});

export default router;
