import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
// ... (previous imports)
import { createLocation, getAllLocations, updateLocation, deleteLocation } from "./locations.service";

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
    const { name, aisle, spot } = req.body;
    // If name is provided (single input mode), use it. Aisle same as name, spot empty.
    const locationData = name 
        ? { aisle: name, spot: '', name } 
        : { aisle, spot, name: `${aisle}-${spot}` };

    const location = await createLocation(locationData);
    return res.status(201).json(createTResult(location));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const putLocation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { aisle, spot, name } = req.body;
        const location = await updateLocation(Number(id), { aisle, spot, name });
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
