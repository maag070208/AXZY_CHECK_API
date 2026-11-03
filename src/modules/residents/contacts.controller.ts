import { Request, Response } from "express";
import * as contactsService from "./contacts.service";
import { respondError } from "@src/core/errors/http-error";
import { AppError } from "@src/core/errors/app-error";
import { roleHasPermission } from "@src/core/permissions/permissions.service";
import { getResidentById } from "./residents.service";

/** El residente edita solo sus contactos; el personal con residents.manage edita los de su cliente. Ajeno → 404. */
const assertContactAccess = async (req: Request, id: number) => {
    const actor = req.user as { id: number; role: string };
    const owner = await contactsService.findContactOwner(id);
    let allowed = Boolean(owner && owner.userId === actor.id);
    if (!allowed && (await roleHasPermission(actor.role, "residents.manage"))) {
        // Multicliente: el dueño debe ser residente del cliente del alcance; de otro cliente → 404.
        allowed = Boolean(owner && (await getResidentById(owner.userId, req.scope)));
    }
    if (!allowed) throw new AppError("CONTACT_NOT_FOUND", "Contacto no encontrado", 404);
};

/** El residente solo toca lo suyo; el personal, residentes del cliente del alcance (de otro cliente → 404). */
const assertResidentTarget = async (req: Request, userId: number) => {
    const actor = req.user as { id: number; role: string } | undefined;
    if (actor && Number(actor.id) === userId) return;
    const resident = await getResidentById(userId, req.scope);
    if (!resident) throw new AppError("RESIDENT_NOT_FOUND", "Residente no encontrado", 404);
};

export const getResidentContacts = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, messages: ["ID de usuario no válido"] });
        }
        await assertResidentTarget(req, userId);
        const contacts = await contactsService.getContactsByUserId(userId);
        res.status(200).json({ success: true, data: contacts });
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const addContact = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        await assertResidentTarget(req, userId);
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
