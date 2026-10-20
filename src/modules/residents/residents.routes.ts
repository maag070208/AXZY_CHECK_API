import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
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
router.post("/", requireRole(["ADMIN"]), addResident);
router.put("/:id", requireRole(["ADMIN"]), putResident);
router.delete("/:id", requireRole(["ADMIN"]), removeResident);

// Resident Contacts Routes
router.get("/:id/contacts", getResidentContacts);
router.post("/:id/contacts", requireRole(["ADMIN"]), addContact);
router.put("/contacts/:contactId", requireRole(["ADMIN"]), putContact);
router.delete("/contacts/:contactId", requireRole(["ADMIN"]), removeContact);

export default router;
