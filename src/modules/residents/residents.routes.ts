import { Router } from "express";
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
import { validate } from "@src/core/validation/validate";
import { idParam, positiveId } from "@src/core/validation/common";
import { z } from "zod";
import { addResidentBody, putResidentBody, contactBody, putContactBody } from "./residents.schemas";

const contactIdParam = z.object({ contactId: positiveId });

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getResidents);
router.get("/catalog/relationships", getRelationships);
router.get("/:id", getResident);
router.post("/", requirePermission("residents.manage"), validate({ body: addResidentBody }), addResident);
router.put("/:id", requirePermission("residents.manage"), validate({ params: idParam, body: putResidentBody }), putResident);
router.delete("/:id", requirePermission("residents.manage"), removeResident);

// Resident Contacts Routes
router.get("/:id/contacts", getResidentContacts);
router.post("/:id/contacts", requirePermission("residents.manage"), validate({ params: idParam, body: contactBody }), addContact);
router.put("/contacts/:contactId", requirePermission("residents.manage"), validate({ params: contactIdParam, body: putContactBody }), putContact);
router.delete("/contacts/:contactId", requirePermission("residents.manage"), removeContact);

export default router;
