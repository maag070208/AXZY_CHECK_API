import { NextFunction, Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as invitationsService from './invitations.service';
import { respondError } from "@src/core/errors/http-error";

const FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción";
const forbidden = (res: Response) => res.status(403).json(createTResult(null, [FORBIDDEN_MESSAGE]));
const isResident = (req: Request) => req.user?.role === "RESDN";

export const datatable = async (req: Request, res: Response) => {
    try {
        const params = req.body ?? {};
        // La residente solo ve las suyas: el filtro lo impone el servidor, no el cliente.
        if (isResident(req)) params.filters = { ...(params.filters ?? {}), createdById: req.user!.id };
        const result = await invitationsService.getDataTableInvitations(params);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const create = async (req: Request, res: Response) => {
    try {
        const { guestName, propertyId, validFrom, validUntil, notes, typeId } = req.body;
        // La residente solo invita a su propia propiedad.
        if (isResident(req) && !(await invitationsService.residentOwnsProperty(req.user!.id, Number(propertyId)))) {
            return forbidden(res);
        }
        // Quien invita es siempre el usuario autenticado, nunca un valor del body (S-03).
        const createdById = req.user!.id;

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
        return respondError(res, error);
    }
};

export const getOne = async (req: Request, res: Response) => {
    try {
        const result = await invitationsService.getInvitationByIdOrCode(req.params.id);
        if (!result) return res.status(404).json(createTResult(null, ["Invitación no encontrada"]));
        if (isResident(req) && result.createdById !== req.user!.id) return forbidden(res);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return respondError(res, error);
    }
};

export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, reason } = req.body;
        // La residente solo revoca (CANCELLED) las suyas; entrada y salida las marca la caseta.
        if (isResident(req)) {
            const own = await invitationsService.getInvitationOwner(Number(req.params.id));
            if (own !== null && (own !== req.user!.id || status !== "CANCELLED")) return forbidden(res);
        }
        const result = await invitationsService.updateInvitationStatus(Number(req.params.id), status, reason, req.user?.id);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return next(error);
    }
};
