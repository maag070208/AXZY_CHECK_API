import { Router } from 'express';
import { authenticate } from '../common/middlewares/auth.middleware';
import { requireRole } from '@src/core/middlewares/require-role.middleware';
import {
    activateCategory,
    activateType,
    createCategory,
    createType,
    deleteCategory,
    deleteType,
    getCategory,
    getType,
    hardDeleteCategory,
    hardDeleteType,
    listCategories,
    listTypes,
    updateCategory,
    updateType,
} from './catalog.controller';

const router = Router();

// =============================================================================
// Rutas de Categorías
// =============================================================================

/**
 * GET /catalog/incident-categories
 * Lista categorías. Usuarios autenticados ven sólo activas; ?adminOnly=true con rol ADMIN incluye inactivas.
 */
router.get('/incident-categories', authenticate, listCategories);

/**
 * GET /catalog/incident-categories/:id
 * Detalle de una categoría.
 */
router.get('/incident-categories/:id', authenticate, getCategory);

/**
 * POST /catalog/incident-categories
 * Crea una nueva categoría. Solo ADMIN.
 */
router.post('/incident-categories', authenticate, requireRole('ADMIN'), createCategory);

/**
 * PUT /catalog/incident-categories/:id
 * Actualiza una categoría. Solo ADMIN.
 */
router.put('/incident-categories/:id', authenticate, requireRole('ADMIN'), updateCategory);

/**
 * DELETE /catalog/incident-categories/:id
 * Soft delete. Solo ADMIN.
 */
router.delete('/incident-categories/:id', authenticate, requireRole('ADMIN'), deleteCategory);

/**
 * DELETE /catalog/incident-categories/:id/hard
 * Borrado físico. Solo ADMIN. Sólo permitido si la categoría está desactivada y sin registros.
 */
router.delete('/incident-categories/:id/hard', authenticate, requireRole('ADMIN'), hardDeleteCategory);

/**
 * PATCH /catalog/incident-categories/:id/activate
 * Reactiva una categoría. Solo ADMIN.
 */
router.patch('/incident-categories/:id/activate', authenticate, requireRole('ADMIN'), activateCategory);

// =============================================================================
// Rutas de Tipos
// =============================================================================

/**
 * GET /catalog/incident-types
 * Lista tipos con filtros opcionales. Usuarios autenticados ven sólo activos; ?adminOnly=true con rol ADMIN incluye inactivos.
 */
router.get('/incident-types', authenticate, listTypes);

/**
 * GET /catalog/incident-types/:id
 * Detalle de un tipo.
 */
router.get('/incident-types/:id', authenticate, getType);

/**
 * POST /catalog/incident-types
 * Crea un nuevo tipo. Solo ADMIN.
 */
router.post('/incident-types', authenticate, requireRole('ADMIN'), createType);

/**
 * PUT /catalog/incident-types/:id
 * Actualiza un tipo. Solo ADMIN.
 */
router.put('/incident-types/:id', authenticate, requireRole('ADMIN'), updateType);

/**
 * DELETE /catalog/incident-types/:id
 * Soft delete. Solo ADMIN.
 */
router.delete('/incident-types/:id', authenticate, requireRole('ADMIN'), deleteType);

/**
 * DELETE /catalog/incident-types/:id/hard
 * Borrado físico. Solo ADMIN. Sólo permitido si el tipo está desactivado y sin registros.
 */
router.delete('/incident-types/:id/hard', authenticate, requireRole('ADMIN'), hardDeleteType);

/**
 * PATCH /catalog/incident-types/:id/activate
 * Reactiva un tipo. Solo ADMIN.
 */
router.patch('/incident-types/:id/activate', authenticate, requireRole('ADMIN'), activateType);

export default router;
