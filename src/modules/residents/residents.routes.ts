import { Router } from "express";
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
router.post("/", addResident);
router.put("/:id", putResident);
router.delete("/:id", removeResident);

// Resident Contacts Routes
router.get("/:id/contacts", getResidentContacts);
router.post("/:id/contacts", addContact);
router.put("/contacts/:contactId", putContact);
router.delete("/contacts/:contactId", removeContact);

export default router;
