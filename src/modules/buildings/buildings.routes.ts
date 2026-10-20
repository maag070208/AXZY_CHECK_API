import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam, flag } from "@src/core/validation/common";

const router = Router();

const buildingBody = z.object({
  name: z.string().trim().min(1, "es obligatorio").max(120),
  floors: z.number().int().min(1).max(200).nullish(),
});
const updateBuildingBody = buildingBody.partial().extend({ active: flag.optional() });

// Edificios de departamentos (T-A1-02). Consulta: propiedades.view; escritura: propiedades.manage.
router.get("/", requirePermission("properties.view"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await prismaClient.building.findMany({ orderBy: { name: "asc" } })));
  } catch (error) {
    return next(error);
  }
});

router.post("/", requirePermission("properties.manage"), validate({ body: buildingBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const building = await prismaClient.building.create({ data: { name: req.body.name, floors: req.body.floors ?? null } });
    return res.status(201).json(createTResult(building));
  } catch (error: any) {
    if (error.code === "P2002") return next(new AppError("BUILDING_EXISTS", "Ya existe un edificio con ese nombre", 409));
    return next(error);
  }
});

router.put("/:id", requirePermission("properties.manage"), validate({ params: idParam, body: updateBuildingBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const building = await prismaClient.building.update({ where: { id: Number(req.params.id) }, data: req.body });
    return res.status(200).json(createTResult(building));
  } catch (error: any) {
    if (error.code === "P2025") return next(new AppError("BUILDING_NOT_FOUND", "Edificio no encontrado", 404));
    if (error.code === "P2002") return next(new AppError("BUILDING_EXISTS", "Ya existe un edificio con ese nombre", 409));
    return next(error);
  }
});

export default router;
