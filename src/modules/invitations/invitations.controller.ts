import { NextFunction, Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as invitationsService from './invitations.service';
import { streamVisitStatsPdf } from './visit-stats-pdf.service';
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
        const { guestName, propertyId, validFrom, validUntil, notes, typeId, expectedPlate, walkIn } = req.body;
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
            typeId: Number(typeId),
            expectedPlate,
            // Solo el personal de caseta crea visitas sin cita; la residente no puede marcarlas.
            walkIn: !isResident(req) && walkIn === true,
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

/** Visitas sin cita esperando autorización (residente: las de su casa; jefe y admin: todas). */
export const pendingApprovals = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await invitationsService.listPendingApprovals({ id: req.user!.id, role: req.user!.role });
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return next(error);
    }
};

/** Autoriza o rechaza una visita sin cita. La regla de propiedad vive en el servicio. */
export const decideApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { decision, reason } = req.body;
        const result = await invitationsService.decideVisitApproval(
            Number(req.params.id),
            { id: req.user!.id, role: req.user!.role },
            decision,
            reason,
        );
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return next(error);
    }
};

/** Lo que la caseta necesita para marcar visitas que rebasaron su permanencia. */
export const casetaStatus = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        return res.status(200).json(createTResult(await invitationsService.getCasetaStatus()));
    } catch (error: any) {
        return next(error);
    }
};

/** Indicadores de visitas para la administración. */
export const stats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { from, to, propertyId } = req.query as { from: string; to: string; propertyId?: string };
        const result = await invitationsService.getVisitStats({
            from: new Date(from),
            to: new Date(to),
            propertyId: propertyId ? Number(propertyId) : undefined,
        });
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return next(error);
    }
};

/** Los mismos indicadores, en PDF para entregar a la administración. */
export const statsPdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { from, to, propertyId } = req.query as { from: string; to: string; propertyId?: string };
        await streamVisitStatsPdf(res, {
            from: new Date(from),
            to: new Date(to),
            propertyId: propertyId ? Number(propertyId) : undefined,
        });
    } catch (error: any) {
        return next(error);
    }
};

export const getVisitAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.status(200).json(createTResult(await invitationsService.getVisitAlerts(req.user!.id)));
    } catch (error: any) {
        return next(error);
    }
};

export const setVisitAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.status(200).json(createTResult(await invitationsService.setVisitAlerts(req.user!.id, req.body.enabled)));
    } catch (error: any) {
        return next(error);
    }
};
