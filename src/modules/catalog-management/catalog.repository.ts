import { prismaClient } from '@src/core/config/database';
import { CreateCategoryInput, CreateTypeInput, IncidentCategoryDto, IncidentTypeDto, UpdateCategoryInput, UpdateTypeInput } from './catalog.dto';

/**
 * @description Repositorio para la gestión de categorías de catálogo (Incidentes / Mantenimiento).
 * Encapsula todas las operaciones de acceso a datos sobre IncidentCategory.
 */
export const IncidentCategoryRepository = {
    /**
     * @description Lista categorías activas. Permite filtrar por tipo (INCIDENT o MAINTENANCE).
     * @param type Filtro opcional por discriminador de tipo.
     * @returns Lista de categorías activas.
     */
    async findAllActive(type?: string): Promise<IncidentCategoryDto[]> {
        return prismaClient.incidentCategory.findMany({
            where: {
                active: true,
                ...(type ? { type } : {}),
            },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
            orderBy: { id: 'asc' },
        });
    },

    /**
     * @description Lista todas las categorías (incluyendo inactivas). Sólo para administración.
     * @param type Filtro opcional por discriminador de tipo.
     * @returns Lista completa de categorías ordenadas por id.
     */
    async findAllIncludingInactive(type?: string): Promise<IncidentCategoryDto[]> {
        return prismaClient.incidentCategory.findMany({
            where: {
                ...(type ? { type } : {}),
            },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
            orderBy: { id: 'asc' },
        });
    },

    /**
     * @description Obtiene una categoría por id.
     * @param id Identificador numérico.
     * @returns Categoría o null si no existe.
     */
    async findById(id: number): Promise<IncidentCategoryDto | null> {
        return prismaClient.incidentCategory.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
        });
    },

    /**
     * @description Crea una nueva categoría.
     * @param data Datos validados (CreateCategoryInput).
     * @returns Categoría creada.
     */
    async create(data: CreateCategoryInput): Promise<IncidentCategoryDto> {
        return prismaClient.incidentCategory.create({
            data: {
                name: data.name,
                value: data.value,
                color: data.color ?? null,
                icon: data.icon ?? null,
                type: data.type,
            },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
        });
    },

    /**
     * @description Actualiza una categoría existente.
     * @param id Identificador.
     * @param data Campos a actualizar.
     * @returns Categoría actualizada.
     */
    async update(id: number, data: UpdateCategoryInput): Promise<IncidentCategoryDto> {
        return prismaClient.incidentCategory.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.value !== undefined ? { value: data.value } : {}),
                ...(data.color !== undefined ? { color: data.color } : {}),
                ...(data.icon !== undefined ? { icon: data.icon } : {}),
                ...(data.type !== undefined ? { type: data.type } : {}),
            },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
        });
    },

    /**
     * @description Soft delete: marca la categoría como inactiva sin eliminar la fila.
     * @param id Identificador.
     * @returns Categoría con active=false.
     */
    async softDelete(id: number): Promise<IncidentCategoryDto> {
        return prismaClient.incidentCategory.update({
            where: { id },
            data: { active: false },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
        });
    },

    /**
     * @description Reactiva una categoría previamente desactivada.
     * @param id Identificador.
     * @returns Categoría con active=true.
     */
    async activate(id: number): Promise<IncidentCategoryDto> {
        return prismaClient.incidentCategory.update({
            where: { id },
            data: { active: true },
            select: {
                id: true,
                name: true,
                value: true,
                color: true,
                icon: true,
                type: true,
                active: true,
            },
        });
    },
};

/**
 * @description Repositorio para la gestión de tipos (subclasificación) del catálogo.
 */
export const IncidentTypeRepository = {
    /**
     * @description Lista tipos activos. Permite filtrar por categoryId y/o tipo de la categoría.
     * @param filters.categoryId Filtro opcional por categoría padre.
     * @param filters.type Filtro opcional por discriminador INCIDENT/MAINTENANCE.
     * @returns Lista de tipos activos.
     */
    async findAllActive(filters: { categoryId?: number; type?: string }): Promise<IncidentTypeDto[]> {
        return prismaClient.incidentType.findMany({
            where: {
                active: true,
                ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
                ...(filters.type
                    ? { category: { type: filters.type, active: true } }
                    : {}),
            },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
            orderBy: { id: 'asc' },
        });
    },

    /**
     * @description Lista todos los tipos incluyendo inactivos.
     * @param filters.categoryId Filtro opcional.
     * @param filters.type Filtro opcional por tipo de categoría.
     * @returns Lista completa.
     */
    async findAllIncludingInactive(filters: { categoryId?: number; type?: string }): Promise<IncidentTypeDto[]> {
        return prismaClient.incidentType.findMany({
            where: {
                ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
                ...(filters.type
                    ? { category: { type: filters.type } }
                    : {}),
            },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
            orderBy: { id: 'asc' },
        });
    },

    /**
     * @description Obtiene un tipo por id.
     * @param id Identificador numérico.
     * @returns Tipo o null.
     */
    async findById(id: number): Promise<IncidentTypeDto | null> {
        return prismaClient.incidentType.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
        });
    },

    /**
     * @description Crea un nuevo tipo.
     * @param data Datos validados (CreateTypeInput).
     * @returns Tipo creado.
     */
    async create(data: CreateTypeInput): Promise<IncidentTypeDto> {
        return prismaClient.incidentType.create({
            data: {
                name: data.name,
                value: data.value,
                categoryId: data.categoryId,
            },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
        });
    },

    /**
     * @description Actualiza un tipo existente.
     * @param id Identificador.
     * @param data Campos a actualizar.
     * @returns Tipo actualizado.
     */
    async update(id: number, data: UpdateTypeInput): Promise<IncidentTypeDto> {
        return prismaClient.incidentType.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.value !== undefined ? { value: data.value } : {}),
                ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
            },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
        });
    },

    /**
     * @description Soft delete: marca el tipo como inactivo.
     * @param id Identificador.
     * @returns Tipo con active=false.
     */
    async softDelete(id: number): Promise<IncidentTypeDto> {
        return prismaClient.incidentType.update({
            where: { id },
            data: { active: false },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
        });
    },

    /**
     * @description Reactiva un tipo previamente desactivado.
     * @param id Identificador.
     * @returns Tipo con active=true.
     */
    async activate(id: number): Promise<IncidentTypeDto> {
        return prismaClient.incidentType.update({
            where: { id },
            data: { active: true },
            select: {
                id: true,
                name: true,
                value: true,
                categoryId: true,
                active: true,
            },
        });
    },

    /**
     * @description Soft delete en bloque de todos los tipos hijos de una categoría.
     * Usado al desactivar una categoría para mantener consistencia.
     * @param categoryId Identificador de la categoría padre.
     */
    async softDeleteByCategory(categoryId: number): Promise<{ count: number }> {
        return prismaClient.incidentType.updateMany({
            where: { categoryId, active: true },
            data: { active: false },
        });
    },

    /**
     * @description Reactiva en bloque los tipos hijos de una categoría.
     * @param categoryId Identificador de la categoría padre.
     */
    async activateByCategory(categoryId: number): Promise<{ count: number }> {
        return prismaClient.incidentType.updateMany({
            where: { categoryId, active: false },
            data: { active: true },
        });
    },
};
