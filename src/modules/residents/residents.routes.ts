import { Router } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { prismaClient } from "@src/core/config/database";
import { moveOutBody } from "./household.schemas";
import { postMoveOut, postSetPrimary } from "./household.controller";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { 
    addResident, 
    getDataTable, 
    getResident, 
    getResidents, 
    putResident, 
    removeResident,
    getRelationships
} from "./residents.controller";
import { 
    getResidentContacts, 
    addContact, 
    putContact, 
    removeContact 
} from "./contacts.controller";
import { requireStaff, selfOrStaff } from "@src/modules/common/middlewares/role-scope.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam, positiveId } from "@src/core/validation/common";
import { z } from "zod";
import { addResidentBody, putResidentBody, contactBody, putContactBody } from "./residents.schemas";

const contactIdParam = z.object({ contactId: positiveId });

const router = Router();

router.post("/datatable", requireStaff, getDataTable);

router.get("/", requireStaff, getResidents);
router.get("/catalog/relationships", getRelationships);

// Tipos de residente (A2) para el formulario de alta desde la propiedad.
router.get("/kinds", requirePermission("properties.view"), async (_req, res, next) => {
  try {
    const kinds = await prismaClient.residentKind.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      select: { code: true, name: true, isHouseholdMember: true, canAuthorizeVisits: true, hasAppAccess: true },
    });
    return res.status(200).json(createTResult(kinds));
  } catch (error) {
    return next(error);
  }
});
router.get("/:id", selfOrStaff(), getResident);
router.post("/", requirePermission("residents.manage"), validate({ body: addResidentBody }), addResident);
router.put("/:id", requirePermission("residents.manage"), validate({ params: idParam, body: putResidentBody }), putResident);
router.delete("/:id", requirePermission("residents.manage"), removeResident);

// Resident Contacts Routes
router.get("/:id/contacts", selfOrStaff(), getResidentContacts);
router.post("/:id/contacts", requirePermission("residents.manage"), validate({ params: idParam, body: contactBody }), addContact);
router.put("/contacts/:contactId", requirePermission("residents.manage"), validate({ params: contactIdParam, body: putContactBody }), putContact);
router.delete("/contacts/:contactId", requirePermission("residents.manage"), removeContact);

// Titular y mudanza (A2).
router.post("/:id/primary", requirePermission("residents.manage"), validate({ params: idParam }), postSetPrimary);
router.post("/:id/move-out", requirePermission("residents.manage"), validate({ params: idParam, body: moveOutBody }), postMoveOut);

export default router;
