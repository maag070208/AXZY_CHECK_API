import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prismaClient } from "@src/core/config/database";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { emptyable, flag } from "@src/core/validation/common";
import { findDuplicates } from "@src/modules/residents/household.service";
import { documentReadUrl, expiringDocuments, listDocuments, uploadDocument } from "./documents.service";
import { createResidentAccount } from "./account.service";
import { idParam, positiveId } from "@src/core/validation/common";

const router = Router();

const searchQuery = z.object({ q: z.string().trim().max(80).optional() });
const personBody = z.object({
  firstName: z.string().trim().min(1, "es obligatorio").max(80),
  lastName: z.string().trim().max(80).nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: emptyable(z.string().trim().email("no es un correo válido")),
  // Sin declararlo Zod lo descartaba y el aviso de duplicado (409) nunca se podía confirmar.
  confirmNewPerson: flag.optional(),
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

// Documentos privados (A2): solo ADMIN los ve (documents.view). Subir: residents.manage.
const documentBody = z.object({
  kindCode: z.string().trim().min(1).max(40),
  mediaFileId: positiveId,
  expiresAt: z.string().nullish(),
  notes: z.string().trim().max(500).nullish(),
});

router.get("/documents/expiring", requirePermission("documents.view"), validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await expiringDocuments(Number(req.query.days ?? 30))));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/documents", requirePermission("documents.view"), validate({ params: idParam }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await listDocuments(Number(req.params.id))));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/documents", requirePermission("residents.manage"), validate({ params: idParam, body: documentBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await uploadDocument(Number(req.params.id), req.body);
    return res.status(201).json(createTResult(doc));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/documents/:docId/url", requirePermission("documents.view"), validate({ params: idParam.extend({ docId: positiveId }) }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await documentReadUrl(Number(req.params.id), Number(req.params.docId))));
  } catch (error) {
    return next(error);
  }
});

// Contactos de la persona: datos personales, solo residents.manage.
const contactBody = z.object({
  name: z.string().trim().min(1, "es obligatorio").max(120),
  phone: z.string().trim().max(30).nullish(),
  email: emptyable(z.string().trim().email("no es un correo válido")),
  relationship: z.string().trim().max(60).nullish(),
});

router.get("/:id/contacts", requirePermission("residents.manage"), validate({ params: idParam }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(200).json(createTResult(await prismaClient.personContact.findMany({ where: { personId: Number(req.params.id) }, orderBy: { id: "asc" } })));
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/contacts", requirePermission("residents.manage"), validate({ params: idParam, body: contactBody }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contact = await prismaClient.personContact.create({
      data: { personId: Number(req.params.id), name: req.body.name, phone: req.body.phone ?? null, email: req.body.email || null, relationship: req.body.relationship ?? null },
    });
    return res.status(201).json(createTResult(contact));
  } catch (error) {
    return next(error);
  }
});

// Cuenta de APP desde el residente (A2, T-A2-06).
router.post("/:id/account", requirePermission("residents.manage"), validate({ params: idParam, body: z.object({ username: z.string().trim().min(3).max(50), password: z.string().min(6).max(100) }) }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(201).json(createTResult(await createResidentAccount(Number(req.params.id), req.body)));
  } catch (error) {
    return next(error);
  }
});

export default router;
