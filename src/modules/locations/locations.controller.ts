import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import { createLocation, deleteLocation, getAllLocations, getDataTableLocations, updateLocation } from "./locations.service";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await getDataTableLocations(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getLocations = async (req: Request, res: Response) => {
  try {
    const locations = await getAllLocations();
    return res.status(200).json(createTResult(locations));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const addLocation = async (req: Request, res: Response) => {
  try {
    const { name, aisle, spot, number } = req.body;
    
    // Check if we have structured data
    const hasStructuredData = aisle !== undefined && spot !== undefined && number !== undefined;

    const locationData = hasStructuredData
        ? { aisle, spot, number, name: name || `${aisle}-${spot}-${number}` } 
        : { aisle: name, spot: '', number: '', name };

    const location = await createLocation(locationData);
    return res.status(201).json(createTResult(location));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const putLocation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { aisle, spot, number, name } = req.body;
        const location = await updateLocation(Number(id), { aisle, spot, number, name });
        return res.status(200).json(createTResult(location));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const removeLocation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const location = await deleteLocation(Number(id));
        return res.status(200).json(createTResult(location));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message || "Error eliminando zona"));
    }
};
