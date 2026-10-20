import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import { validate } from "@src/core/validation/validate";
import { listSettings, setSetting } from "@src/core/settings/app-settings.service";

const router = Router();

const ADMIN = requireRole(["ADMIN"]);
const updateBody = z.object({ value: z.string().max(500) });
const keyParam = z.object({ key: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/) });

// Express 4 no captura promesas rechazadas: los errores van a next() para
// que llegue al errorHandler (AppError → su código y estado).
router.get("/", ADMIN, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await listSettings()));
  } catch (error) {
    return next(error);
  }
});

router.put("/:key", ADMIN, validate({ params: keyParam, body: updateBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await setSetting(req.params.key, req.body.value);
    return res.status(200).json(createTResult({ key: updated.key, value: updated.value, valueType: updated.valueType }));
  } catch (error) {
    return next(error);
  }
});

export default router;
