import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as catalogAdminService from "./catalog-admin.service";

/**
 * @description GET /catalog-admin/categories?type=INCIDENT|MAINTENANCE|CASA_CLUB
 * Lists categories (including inactive) for the admin catalog screen.
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const result = await catalogAdminService.getCategories(type ? String(type) : undefined);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description POST /catalog-admin/categories */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, value, type, color, icon } = req.body;
    if (!name || !value || !type) {
      return res.status(400).json(createTResult(null, ["Nombre, valor y tipo de catálogo son requeridos"]));
    }
    if (!catalogAdminService.CATALOG_TYPES.includes(type)) {
      return res.status(400).json(createTResult(null, ["Tipo de catálogo inválido"]));
    }
    const category = await catalogAdminService.createCategory({ name, value, type, color, icon });
    return res.status(201).json(createTResult(category));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description PUT /catalog-admin/categories/:id */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, value, color, icon, active } = req.body;
    const category = await catalogAdminService.updateCategory(Number(id), {
      name,
      value,
      color,
      icon,
      active,
    });
    return res.status(200).json(createTResult(category));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description DELETE /catalog-admin/categories/:id — 1st call soft-disables, 2nd call deletes permanently. */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await catalogAdminService.deleteCategory(Number(id));
    const message = result.softDeleted
      ? "La categoría se desactivó. Elimínala de nuevo para borrarla permanentemente"
      : "La categoría se eliminó permanentemente";
    return res.status(200).json(createTResult({ ...result, message }));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description PUT /catalog-admin/categories/reorder — body: { ids: number[] } */
export const reorderCategories = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
      return res.status(400).json(createTResult(null, ["Se espera un arreglo de ids"]));
    }
    await catalogAdminService.reorderCategories(ids);
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description PUT /catalog-admin/categories/:id/pin — "Fijar al inicio". */
export const pinCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await catalogAdminService.pinCategory(Number(id));
    return res.status(200).json(createTResult(category));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description GET /catalog-admin/types?categoryId= */
export const getTypes = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.query;
    const result = await catalogAdminService.getTypes(categoryId ? Number(categoryId) : undefined);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description POST /catalog-admin/types */
export const createType = async (req: Request, res: Response) => {
  try {
    const { name, value, categoryId } = req.body;
    if (!name || !value || !categoryId) {
      return res.status(400).json(createTResult(null, ["Nombre, valor y categoría son requeridos"]));
    }
    const type = await catalogAdminService.createType({ name, value, categoryId: Number(categoryId) });
    return res.status(201).json(createTResult(type));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description PUT /catalog-admin/types/:id */
export const updateType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, value, categoryId, active } = req.body;
    const type = await catalogAdminService.updateType(Number(id), {
      name,
      value,
      categoryId: categoryId !== undefined ? Number(categoryId) : undefined,
      active,
    });
    return res.status(200).json(createTResult(type));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description DELETE /catalog-admin/types/:id — 1st call soft-disables, 2nd call deletes permanently. */
export const deleteType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await catalogAdminService.deleteType(Number(id));
    const message = result.softDeleted
      ? "El tipo se desactivó. Elimínalo de nuevo para borrarlo permanentemente"
      : "El tipo se eliminó permanentemente";
    return res.status(200).json(createTResult({ ...result, message }));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description PUT /catalog-admin/types/reorder — body: { ids: number[] } */
export const reorderTypes = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
      return res.status(400).json(createTResult(null, ["Se espera un arreglo de ids"]));
    }
    await catalogAdminService.reorderTypes(ids);
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description PUT /catalog-admin/types/:id/pin — "Fijar al inicio". */
export const pinType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const type = await catalogAdminService.pinType(Number(id));
    return res.status(200).json(createTResult(type));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};
