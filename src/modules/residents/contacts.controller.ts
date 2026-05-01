import { Request, Response } from "express";
import * as contactsService from "./contacts.service";

export const getResidentContacts = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, messages: ["ID de usuario no válido"] });
        }
        const contacts = await contactsService.getContactsByUserId(userId);
        res.status(200).json({ success: true, data: contacts });
    } catch (error: any) {
        res.status(500).json({ success: false, messages: [error.message] });
    }
};

export const addContact = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        const contact = await contactsService.createContact(userId, req.body);
        res.status(201).json({ success: true, data: contact });
    } catch (error: any) {
        res.status(500).json({ success: false, messages: [error.message] });
    }
};

export const putContact = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.contactId);
        const contact = await contactsService.updateContact(id, req.body);
        res.status(200).json({ success: true, data: contact });
    } catch (error: any) {
        res.status(500).json({ success: false, messages: [error.message] });
    }
};

export const removeContact = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.contactId);
        await contactsService.deleteContact(id);
        res.status(200).json({ success: true, message: "Contacto eliminado" });
    } catch (error: any) {
        res.status(500).json({ success: false, messages: [error.message] });
    }
};
