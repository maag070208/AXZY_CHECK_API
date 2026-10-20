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

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getResidents);
router.get("/catalog/relationships", getRelationships);
router.get("/:id", getResident);
router.post("/", requirePermission("residents.manage"), addResident);
router.put("/:id", requirePermission("residents.manage"), putResident);
router.delete("/:id", requirePermission("residents.manage"), removeResident);

// Resident Contacts Routes
router.get("/:id/contacts", getResidentContacts);
router.post("/:id/contacts", requirePermission("residents.manage"), addContact);
router.put("/contacts/:contactId", requirePermission("residents.manage"), putContact);
router.delete("/contacts/:contactId", requirePermission("residents.manage"), removeContact);

export default router;
