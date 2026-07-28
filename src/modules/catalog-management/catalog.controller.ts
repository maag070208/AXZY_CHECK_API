import { Request, Response } from 'express';
import { createTResult } from '@src/core/mappers/tresult.mapper';
import { IncidentCategoryService, IncidentTypeService } from './catalog.service';

/**
 * @description Helper para enviar respuesta exitosa con TResult.
 */
const ok = <T>(res: Response, data: T, status = 200): Response => {
    return res.status(status).json(createTResult(data));
};

/**
 * @description Helper para enviar respuesta de error 400 controlado.
 */
const fail = (res: Response, message: string, status = 400): Response => {
    return res.status(status).json(createTResult(null, [message]));
};

/**
 * @description Parsea un id numérico del request params.
 */
const parseId = (raw: string): number | null => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
};

// =============================================================================
// Controladores de Categorías
// =============================================================================

/**
 * @description Lista categorías. Si ?adminOnly=true y el usuario es ADMIN, incluye inactivas.
 * GET /catalog/incident-categories
 */
export const listCategories = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { type, adminOnly } = req.query;
        // @ts-ignore
        const isAdmin = req.user?.role === 'ADMIN';
        const includeInactive = adminOnly === 'true' && isAdmin;
        const data = includeInactive
            ? await IncidentCategoryService.listAll(type as string | undefined)
            : await IncidentCategoryService.listActive(type as string | undefined);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al listar categorías';
        return fail(res, message, 500);
    }
};

/**
 * @description Obtiene una categoría por id.
 * GET /catalog/incident-categories/:id
 */
export const getCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentCategoryService.getById(id);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al obtener categoría';
        const status = message === 'Categoría no encontrada' ? 404 : 500;
        return fail(res, message, status);
    }
};

/**
 * @description Crea una nueva categoría.
 * POST /catalog/incident-categories (ADMIN)
 */
export const createCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
        const data = await IncidentCategoryService.create(req.body);
        return ok(res, data, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al crear categoría';
        const status = message.includes('Ya existe') ? 400 : 500;
        return fail(res, message, status);
    }
};

/**
 * @description Actualiza una categoría.
 * PUT /catalog/incident-categories/:id (ADMIN)
 */
export const updateCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentCategoryService.update(id, req.body);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al actualizar categoría';
        let status = 500;
        if (message === 'Categoría no encontrada') status = 404;
        else if (message.includes('Ya existe')) status = 400;
        return fail(res, message, status);
    }
};

/**
 * @description Soft delete de una categoría.
 * DELETE /catalog/incident-categories/:id (ADMIN)
 */
export const deleteCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentCategoryService.softDelete(id);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al eliminar categoría';
        const status = message === 'Categoría no encontrada' ? 404 : 500;
        return fail(res, message, status);
    }
};

/**
 * @description Reactiva una categoría.
 * PATCH /catalog/incident-categories/:id/activate (ADMIN)
 */
export const activateCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentCategoryService.activate(id);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al activar categoría';
        const status = message === 'Categoría no encontrada' ? 404 : 500;
        return fail(res, message, status);
    }
};

// =============================================================================
// Controladores de Tipos
// =============================================================================

/**
 * @description Lista tipos con filtros opcionales (categoryId, type).
 * GET /catalog/incident-types
 */
export const listTypes = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { categoryId, type, adminOnly } = req.query;
        // @ts-ignore
        const isAdmin = req.user?.role === 'ADMIN';
        const includeInactive = adminOnly === 'true' && isAdmin;
        const filters = {
            categoryId: categoryId ? parseId(String(categoryId)) ?? undefined : undefined,
            type: type as string | undefined,
        };
        const data = includeInactive
            ? await IncidentTypeService.listAll(filters)
            : await IncidentTypeService.listActive(filters);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al listar tipos';
        return fail(res, message, 500);
    }
};

/**
 * @description Obtiene un tipo por id.
 * GET /catalog/incident-types/:id
 */
export const getType = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentTypeService.getById(id);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al obtener tipo';
        const status = message === 'Tipo no encontrado' ? 404 : 500;
        return fail(res, message, status);
    }
};

/**
 * @description Crea un nuevo tipo.
 * POST /catalog/incident-types (ADMIN)
 */
export const createType = async (req: Request, res: Response): Promise<Response> => {
    try {
        const data = await IncidentTypeService.create(req.body);
        return ok(res, data, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al crear tipo';
        let status = 500;
        if (message.includes('Ya existe')) status = 400;
        else if (message.includes('padre no existe') || message.includes('inactiva')) status = 400;
        return fail(res, message, status);
    }
};

/**
 * @description Actualiza un tipo.
 * PUT /catalog/incident-types/:id (ADMIN)
 */
export const updateType = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentTypeService.update(id, req.body);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al actualizar tipo';
        let status = 500;
        if (message === 'Tipo no encontrado') status = 404;
        else if (message.includes('Ya existe') || message.includes('padre') || message.includes('inactiva')) status = 400;
        return fail(res, message, status);
    }
};

/**
 * @description Soft delete de un tipo.
 * DELETE /catalog/incident-types/:id (ADMIN)
 */
export const deleteType = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentTypeService.softDelete(id);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al eliminar tipo';
        const status = message === 'Tipo no encontrado' ? 404 : 500;
        return fail(res, message, status);
    }
};

/**
 * @description Reactiva un tipo.
 * PATCH /catalog/incident-types/:id/activate (ADMIN)
 */
export const activateType = async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = parseId(req.params.id);
        if (!id) return fail(res, 'ID inválido');
        const data = await IncidentTypeService.activate(id);
        return ok(res, data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al activar tipo';
        const status = message === 'Tipo no encontrado' ? 404 : 500;
        return fail(res, message, status);
    }
};
