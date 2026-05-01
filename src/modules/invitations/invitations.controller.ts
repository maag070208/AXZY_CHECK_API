import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as invitationsService from './invitations.service';

export const datatable = async (req: Request, res: Response) => {
    try {
        const result = await invitationsService.getDataTableInvitations(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const create = async (req: Request, res: Response) => {
    try {
        const { guestName, propertyId, validFrom, validUntil, notes, createdById, typeId } = req.body;
        
        const result = await invitationsService.createInvitation({
            guestName,
            propertyId: Number(propertyId),
            createdById: Number(createdById),
            validFrom: new Date(validFrom),
            validUntil: new Date(validUntil),
            notes,
            typeId: Number(typeId)
        });
        
        return res.status(201).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getOne = async (req: Request, res: Response) => {
    try {
        const result = await invitationsService.getInvitationByIdOrCode(req.params.id);
        if (!result) return res.status(404).json(createTResult(null, ["Invitación no encontrada"]));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const updateStatus = async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        const result = await invitationsService.updateInvitationStatus(Number(req.params.id), status);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
