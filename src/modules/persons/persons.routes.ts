import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prismaClient } from "@src/core/config/database";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { emptyable } from "@src/core/validation/common";
import { findDuplicates } from "@src/modules/residents/household.service";

const router = Router();

const searchQuery = z.object({ q: z.string().trim().max(80).optional() });
const personBody = z.object({
  firstName: z.string().trim().min(1, "es obligatorio").max(80),
  lastName: z.string().trim().max(80).nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: emptyable(z.string().trim().email("no es un correo válido")),
});

// Búsqueda de personas para asignar titular, propietario o inquilino (A2).
router.get("/", requirePermission("residents.manage"), validate({ query: searchQuery }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string | undefined) ?? "";
    const persons = await prismaClient.person.findMany({
      where: q
        ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : undefined,
      take: 10,
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });
    return res.status(200).json(createTResult(persons));
  } catch (error) {
    return next(error);
  }
});

// Alta de persona. Si ya existe alguien parecido, responde 409 hasta confirmar.
router.post("/", requirePermission("residents.manage"), validate({ body: personBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const duplicates = await findDuplicates(prismaClient as any, {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phone: req.body.phone,
      email: req.body.email || null,
    });
    if (duplicates.length > 0 && !req.body.confirmNewPerson) {
      return res.status(409).json({ ...createTResult(null, ["Ya existe una persona con estos datos"]), code: "DUPLICATE_PERSON", candidates: duplicates });
    }
    const person = await prismaClient.person.create({
      data: {
        firstName: req.body.firstName,
        lastName: req.body.lastName ?? null,
        phone: req.body.phone ?? null,
        email: req.body.email || null,
      },
    });
    return res.status(201).json(createTResult(person));
  } catch (error) {
    return next(error);
  }
});

export default router;
