import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { positiveId, idParam } from "@src/core/validation/common";
import { recordAudit } from "@src/core/audit/audit";

/**
 * Definición de un catálogo administrable (T-F0-04).
 * `model` es el nombre del delegado de Prisma. Todas las tablas de catálogo
 * comparten: name (código estable, MAYÚSCULAS), value (etiqueta), order, active,
 * isSystem (valor creado por el sistema: no se renombra ni se borra).
 */
export interface CatalogDefinition {
  key: string;
  label: string;
  model: "propertyType" | "propertyStatus" | "invitationType" | "residentRelationship";
}

const CODE = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,29}$/, "debe estar en MAYÚSCULAS, sin espacios (ej. CASA_HABITACION)");
const VALUE = z.string().trim().min(1, "es obligatorio").max(120);

const createBody = z.object({ name: CODE, value: VALUE, order: z.number().int().min(0).optional() });
const updateBody = z.object({
  name: CODE.optional(),
  value: VALUE.optional(),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
const reorderBody = z.object({ ids: z.array(positiveId).min(1) });

const SELECT = { id: true, name: true, value: true, order: true, active: true, isSystem: true } as const;

const conflict = (res: Response, message: string) =>
  res.status(409).json({ ...createTResult(null, [message]), code: "CATALOG_CONFLICT" });

/**
 * Genera el router CRUD de un catálogo. Lectura para cualquier usuario autenticado;
 * escritura solo con el permiso catalogs.manage. Cada escritura deja registro en AuditLog
 * dentro de la misma transacción.
 */
export const createCatalogRouter = (def: CatalogDefinition) => {
  const router = Router();
  const delegateOf = (client: Prisma.TransactionClient) => (client as any)[def.model];
  const ADMIN = requirePermission("catalogs.manage");
  const actorId = (req: Request): number => (req as any).user.id;
  const audit = (req: Request, action: string, entityId: number | string, before: unknown, after: unknown, tx: Prisma.TransactionClient) =>
    recordAudit({ actorId: actorId(req), action: `${def.key}.${action}`, entity: def.key, entityId, before, after }, tx);

  router.get("/", async (req: Request, res: Response) => {
    const includeInactive = req.query.all === "true";
    const rows = await delegateOf(prismaClient as any).findMany({
      where: includeInactive ? {} : { active: true },
      select: SELECT,
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
    return res.status(200).json(createTResult(rows));
  });

  router.post("/", ADMIN, validate({ body: createBody }), async (req: Request, res: Response) => {
    try {
      const row = await prismaClient.$transaction(async (tx) => {
        const created = await delegateOf(tx).create({
          data: { name: req.body.name, value: req.body.value, order: req.body.order ?? 0, isSystem: false },
          select: SELECT,
        });
        await audit(req, "create", created.id, null, created, tx);
        return created;
      });
      return res.status(201).json(createTResult(row));
    } catch (error: any) {
      if (error.code === "P2002") return conflict(res, "Ya existe un valor con ese código");
      throw error;
    }
  });

  router.put("/reorder", ADMIN, validate({ body: reorderBody }), async (req: Request, res: Response) => {
    await prismaClient.$transaction(async (tx) => {
      for (const [index, id] of req.body.ids.entries()) {
        await delegateOf(tx).update({ where: { id }, data: { order: index } });
      }
      await audit(req, "reorder", "reorder", null, { ids: req.body.ids }, tx);
    });
    return res.status(200).json(createTResult(true));
  });

  router.put("/:id", ADMIN, validate({ params: idParam, body: updateBody }), async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      const outcome = await prismaClient.$transaction(async (tx) => {
        const current = await delegateOf(tx).findUnique({ where: { id } });
        if (!current) return { error: "not-found" as const };
        if (current.isSystem && req.body.name !== undefined && req.body.name !== current.name) {
          return { error: "system-rename" as const };
        }
        const row = await delegateOf(tx).update({ where: { id }, data: req.body, select: SELECT });
        await audit(req, "update", id, { name: current.name, value: current.value, order: current.order, active: current.active }, row, tx);
        return { row };
      });
      if ("error" in outcome) {
        if (outcome.error === "not-found") return res.status(404).json(createTResult(null, ["Valor no encontrado"]));
        return conflict(res, "El código de un valor del sistema no se puede cambiar");
      }
      return res.status(200).json(createTResult(outcome.row));
    } catch (error: any) {
      if (error.code === "P2002") return conflict(res, "Ya existe un valor con ese código");
      throw error;
    }
  });

  // Borrado en dos pasos: 1.ª vez desactiva; 2.ª vez (ya inactivo) borra si no está en uso.
  router.delete("/:id", ADMIN, validate({ params: idParam }), async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      const outcome = await prismaClient.$transaction(async (tx) => {
        const current = await delegateOf(tx).findUnique({ where: { id } });
        if (!current) return { error: "not-found" as const };
        if (current.isSystem) return { error: "system" as const };

        if (current.active) {
          const row = await delegateOf(tx).update({ where: { id }, data: { active: false }, select: SELECT });
          await audit(req, "deactivate", id, current, row, tx);
          return { deactivated: row };
        }
        await delegateOf(tx).delete({ where: { id } });
        await audit(req, "delete", id, current, null, tx);
        return { deleted: true as const };
      });
      if ("error" in outcome) {
        if (outcome.error === "not-found") return res.status(404).json(createTResult(null, ["Valor no encontrado"]));
        return conflict(res, "Un valor del sistema no se puede borrar; desactívalo");
      }
      if ("deactivated" in outcome) return res.status(200).json(createTResult({ ...outcome.deactivated, deactivated: true }));
      return res.status(200).json(createTResult({ id, deleted: true }));
    } catch (error: any) {
      if (error.code === "P2003") return conflict(res, "El valor está en uso y no se puede borrar");
      throw error;
    }
  });

  return router;
};
