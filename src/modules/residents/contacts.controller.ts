import { Request, Response } from "express";
import * as contactsService from "./contacts.service";
import { respondError } from "@src/core/errors/http-error";
import { AppError } from "@src/core/errors/app-error";
import { roleHasPermission } from "@src/core/permissions/permissions.service";

/** El residente edita solo sus contactos; el personal con residents.manage edita cualquiera. Ajeno → 404. */
const assertContactAccess = async (req: Request, id: number) => {
    const actor = req.user as { id: number; role: string };
    const owner = await contactsService.findContactOwner(id);
    const allowed = owner && (owner.userId === actor.id || (await roleHasPermission(actor.role, "residents.manage")));
    if (!allowed) throw new AppError("CONTACT_NOT_FOUND", "Contacto no encontrado", 404);
};

export const getResidentContacts = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, messages: ["ID de usuario no válido"] });
        }
        const contacts = await contactsService.getContactsByUserId(userId);
        res.status(200).json({ success: true, data: contacts });
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const addContact = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        const contact = await contactsService.createContact(userId, req.body);
        res.status(201).json({ success: true, data: contact });
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const putContact = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.contactId);
        await assertContactAccess(req, id);
        const contact = await contactsService.updateContact(id, req.body);
        res.status(200).json({ success: true, data: contact });
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const removeContact = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.contactId);
        await assertContactAccess(req, id);
        await contactsService.deleteContact(id);
        res.status(200).json({ success: true, message: "Contacto eliminado" });
    } catch (error: any) {
        return respondError(res, error);
    }
};
