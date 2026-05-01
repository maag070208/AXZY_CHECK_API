import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { createProperty, deleteProperty, getAllProperties, getDataTableProperties, getPropertyById, updateProperty } from "./properties.service";

export const getProperties = async (req: Request, res: Response) => {
    try {
        const properties = await getAllProperties();
        return res.status(200).json(createTResult(properties));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getProperty = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const property = await getPropertyById(Number(id));
        return res.status(200).json(createTResult(property));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await getDataTableProperties(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const addProperty = async (req: Request, res: Response) => {
    try {
        const property = await createProperty(req.body);
        return res.status(201).json(createTResult(property));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json(createTResult(null, ["El identificador ya existe para otra propiedad. Por favor usa uno único."]));
        }
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const putProperty = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const property = await updateProperty(Number(id), req.body);
        return res.status(200).json(createTResult(property));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json(createTResult(null, ["El identificador ya existe para otra propiedad."]));
        }
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const removeProperty = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const property = await deleteProperty(Number(id));
        return res.status(200).json(createTResult(property));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
