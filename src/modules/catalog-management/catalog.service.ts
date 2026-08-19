import { Prisma } from '@prisma/client';
import { prismaClient } from '@src/core/config/database';
import { IncidentCategoryRepository, IncidentTypeRepository } from './catalog.repository';
import {
    CreateCategoryInput,
    CreateTypeInput,
    IncidentCategoryDto,
    IncidentTypeDto,
    UpdateCategoryInput,
    UpdateTypeInput,
} from './catalog.dto';

/**
 * @description Servicio para la gestión de categorías de catálogo.
 * Centraliza reglas de negocio (validaciones, manejo de errores) sobre IncidentCategoryRepository.
 */
export const IncidentCategoryService = {
    /**
     * @description Lista categorías activas, opcionalmente filtradas por tipo.
     * @param type Filtro opcional: 'INCIDENT' o 'MAINTENANCE'.
     * @returns Lista de categorías activas.
     */
    async listActive(type?: string): Promise<IncidentCategoryDto[]> {
        return IncidentCategoryRepository.findAllActive(type);
    },

    /**
     * @description Lista todas las categorías (incluyendo inactivas) — uso administrativo.
     * @param type Filtro opcional.
     * @returns Lista completa.
     */
    async listAll(type?: string): Promise<IncidentCategoryDto[]> {
        return IncidentCategoryRepository.findAllIncludingInactive(type);
    },

    /**
     * @description Obtiene una categoría por id.
     * @param id Identificador.
     * @throws Error si no existe.
     * @returns Categoría encontrada.
     */
    async getById(id: number): Promise<IncidentCategoryDto> {
        const category = await IncidentCategoryRepository.findById(id);
        if (!category) {
            throw new Error('Categoría no encontrada');
        }
        return category;
    },

    /**
     * @description Crea una nueva categoría.
     * @param data Datos validados por Zod.
     * @throws Error si el nombre ya existe.
     * @returns Categoría creada.
     */
    async create(data: CreateCategoryInput): Promise<IncidentCategoryDto> {
        try {
            return await IncidentCategoryRepository.create(data);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new Error('Ya existe una categoría con ese nombre');
            }
            throw error;
        }
    },

    /**
     * @description Actualiza una categoría existente.
     * @param id Identificador.
     * @param data Campos a actualizar.
     * @throws Error si no existe o si el nombre choca con otro existente.
     * @returns Categoría actualizada.
     */
    async update(id: number, data: UpdateCategoryInput): Promise<IncidentCategoryDto> {
        await this.getById(id);
        try {
            return await IncidentCategoryRepository.update(id, data);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new Error('Ya existe una categoría con ese nombre');
            }
            throw error;
        }
    },

    /**
     * @description Soft delete: marca la categoría como inactiva y desactiva también sus tipos hijos.
     * @param id Identificador.
     * @throws Error si no existe.
     * @returns Categoría con active=false.
     */
    async softDelete(id: number): Promise<IncidentCategoryDto> {
        await this.getById(id);
        // Desactivar también los tipos hijos para mantener consistencia.
        await IncidentTypeRepository.softDeleteByCategory(id);
        return IncidentCategoryRepository.softDelete(id);
    },

    /**
     * @description Reactiva una categoría y sus tipos hijos.
     * @param id Identificador.
     * @throws Error si no existe.
     * @returns Categoría con active=true.
     */
    async activate(id: number): Promise<IncidentCategoryDto> {
        await this.getById(id);
        await IncidentTypeRepository.activateByCategory(id);
        return IncidentCategoryRepository.activate(id);
    },

    /**
     * @description Borrado físico de una categoría y sus tipos. Requiere que la
     * categoría esté previamente desactivada (active=false) y que no existan
     * registros (incidencias/mantenimientos) asociados a ella o a sus tipos.
     * @param id Identificador.
     * @throws Error si no existe, si está activa o si tiene registros asociados.
     * @returns Categoría física eliminada.
     */
    async hardDelete(id: number): Promise<IncidentCategoryDto> {
        const category = await this.getById(id);
        if (category.active) {
            throw new Error('Debe desactivar la categoría antes de poder eliminarla');
        }

        const typeIds = await IncidentTypeRepository.findAllIncludingInactive({ categoryId: id });

        const [incidentsByCat, maintenanceByCat] = await Promise.all([
            prismaClient.incident.count({ where: { categoryId: id } }),
            prismaClient.maintenance.count({ where: { categoryId: id } }),
        ]);

        const incidentsByType = typeIds.length > 0
            ? await prismaClient.incident.count({ where: { typeId: { in: typeIds.map(t => t.id) } } })
            : 0;
        const maintenanceByType = typeIds.length > 0
            ? await prismaClient.maintenance.count({ where: { typeId: { in: typeIds.map(t => t.id) } } })
            : 0;

        if (incidentsByCat > 0 || incidentsByType > 0 || maintenanceByCat > 0 || maintenanceByType > 0) {
            throw new Error('No se puede eliminar la categoría porque tiene registros asociados');
        }

        return IncidentCategoryRepository.hardDelete(id);
    },
};

/**
 * @description Servicio para la gestión de tipos de catálogo.
 */
export const IncidentTypeService = {
    /**
     * @description Lista tipos activos.
     * @param filters.categoryId Filtro opcional por categoría.
     * @param filters.type Filtro opcional por discriminador INCIDENT/MAINTENANCE.
     * @returns Lista de tipos activos.
     */
    async listActive(filters: { categoryId?: number; type?: string }): Promise<IncidentTypeDto[]> {
        return IncidentTypeRepository.findAllActive(filters);
    },

    /**
     * @description Lista todos los tipos (incluyendo inactivos) — uso administrativo.
     * @param filters.categoryId Filtro opcional.
     * @param filters.type Filtro opcional.
     * @returns Lista completa.
     */
    async listAll(filters: { categoryId?: number; type?: string }): Promise<IncidentTypeDto[]> {
        return IncidentTypeRepository.findAllIncludingInactive(filters);
    },

    /**
     * @description Obtiene un tipo por id.
     * @param id Identificador.
     * @throws Error si no existe.
     * @returns Tipo encontrado.
     */
    async getById(id: number): Promise<IncidentTypeDto> {
        const type = await IncidentTypeRepository.findById(id);
        if (!type) {
            throw new Error('Tipo no encontrado');
        }
        return type;
    },

    /**
     * @description Crea un nuevo tipo validando que la categoría padre exista y esté activa.
     * @param data Datos validados.
     * @throws Error si la categoría no existe, está inactiva o el nombre está duplicado.
     * @returns Tipo creado.
     */
    async create(data: CreateTypeInput): Promise<IncidentTypeDto> {
        const category = await IncidentCategoryRepository.findById(data.categoryId);
        if (!category) {
            throw new Error('La categoría padre no existe');
        }
        if (!category.active) {
            throw new Error('No se puede crear un tipo en una categoría inactiva');
        }
        try {
            return await IncidentTypeRepository.create(data);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new Error('Ya existe un tipo con ese nombre');
            }
            throw error;
        }
    },

    /**
     * @description Actualiza un tipo existente.
     * @param id Identificador.
     * @param data Campos a actualizar.
     * @throws Error si no existe, si la categoría destino no existe, o nombre duplicado.
     * @returns Tipo actualizado.
     */
    async update(id: number, data: UpdateTypeInput): Promise<IncidentTypeDto> {
        await this.getById(id);
        if (data.categoryId !== undefined) {
            const category = await IncidentCategoryRepository.findById(data.categoryId);
            if (!category) {
                throw new Error('La categoría padre no existe');
            }
            if (!category.active) {
                throw new Error('No se puede mover a una categoría inactiva');
            }
        }
        try {
            return await IncidentTypeRepository.update(id, data);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new Error('Ya existe un tipo con ese nombre');
            }
            throw error;
        }
    },

    /**
     * @description Soft delete: marca el tipo como inactivo.
     * @param id Identificador.
     * @throws Error si no existe.
     * @returns Tipo con active=false.
     */
    async softDelete(id: number): Promise<IncidentTypeDto> {
        await this.getById(id);
        return IncidentTypeRepository.softDelete(id);
    },

    /**
     * @description Reactiva un tipo previamente desactivado.
     * @param id Identificador.
     * @throws Error si no existe o si su categoría está inactiva.
     * @returns Tipo con active=true.
     */
    async activate(id: number): Promise<IncidentTypeDto> {
        const existing = await this.getById(id);
        const category = await IncidentCategoryRepository.findById(existing.categoryId);
        if (!category || !category.active) {
            throw new Error('No se puede activar un tipo cuya categoría está inactiva');
        }
        return IncidentTypeRepository.activate(id);
    },

    /**
     * @description Borrado físico de un tipo. Requiere que el tipo esté
     * previamente desactivado (active=false) y que no existan registros
     * (incidencias/mantenimientos) asociados a él.
     * @param id Identificador.
     * @throws Error si no existe, si está activo o si tiene registros asociados.
     * @returns Tipo físicamente eliminado.
     */
    async hardDelete(id: number): Promise<IncidentTypeDto> {
        const existing = await this.getById(id);
        if (existing.active) {
            throw new Error('Debe desactivar el tipo antes de poder eliminarlo');
        }

        const [incidents, maintenances] = await Promise.all([
            prismaClient.incident.count({ where: { typeId: id } }),
            prismaClient.maintenance.count({ where: { typeId: id } }),
        ]);
        if (incidents > 0 || maintenances > 0) {
            throw new Error('No se puede eliminar el tipo porque tiene registros asociados');
        }

        return IncidentTypeRepository.hardDelete(id);
    },
};
