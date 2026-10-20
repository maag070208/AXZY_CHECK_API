import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { checkAccess, revokeAuthorization } from "./authorizations.service";

const router = Router();

// Revocación inmediata por el titular (residents.manage).
router.post("/:id/revoke", requirePermission("residents.manage"), validate({ params: idParam }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await revokeAuthorization(Number(req.params.id))));
  } catch (error) {
    return next(error);
  }
});

// Consulta de caseta (access.check): decisión AUTHORIZED / NEEDS_APPROVAL / DENIED.
const checkQuery = z.object({
  propertyId: z.coerce.number().int().positive(),
  personId: z.coerce.number().int().positive(),
  scope: z.enum(["PEDESTRIAN", "VEHICLE"]).default("PEDESTRIAN"),
});
router.get("/check", requirePermission("access.check"), validate({ query: checkQuery }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as z.infer<typeof checkQuery>;
    return res.status(200).json(createTResult(await checkAccess(q.propertyId, q.personId, q.scope)));
  } catch (error) {
    return next(error);
  }
});

export default router;
