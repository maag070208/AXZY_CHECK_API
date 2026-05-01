import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { 
    createResidentUser, 
    deleteResidentUser, 
    getDataTableResidents, 
    getResidentById, 
    getResidentsList, 
    updateResidentUser,
    getRelationshipsList
} from "./residents.service";
import { getUserByUsername } from "../users/user.service";
import { hashPassword } from "@src/core/utils/security";

export const getResidents = async (req: Request, res: Response) => {
    try {
        const result = await getResidentsList();
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getDataTable = async (req: Request, res: Response) => {
    try {
        const result = await getDataTableResidents(req.body);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getResident = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await getResidentById(Number(id));
        if (!result) {
            return res.status(404).json(createTResult(null, ["Residente no encontrado"]));
        }
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const addResident = async (req: Request, res: Response) => {
    try {
        const { 
            name, lastName, username, password, propertyId,
            firstName, fatherLastName, motherLastName, 
            phoneNumber, email, emergencyContact, emergencyPhone, 
            ineFrontUrl, ineBackUrl, notes 
        } = req.body;

        const existing = await getUserByUsername(username);
        if (existing) {
            return res.status(400).json(createTResult(null, ["El nombre de usuario ya está en uso"]));
        }

        const hashed = await hashPassword(password);

        const userData = {
            name,
            lastName,
            username,
            password: hashed,
            propertyId: propertyId ? Number(propertyId) : null
        };

        const profileData = {
            firstName,
            fatherLastName,
            motherLastName,
            phoneNumber,
            email,
            emergencyContact,
            emergencyPhone,
            ineFrontUrl,
            ineBackUrl,
            notes
        };

        const result = await createResidentUser(userData, profileData);
        return res.status(201).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const putResident = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { 
            name, lastName, propertyId, password, username,
            firstName, fatherLastName, motherLastName, 
            phoneNumber, email, emergencyContact, emergencyPhone, 
            ineFrontUrl, ineBackUrl, notes 
        } = req.body;

        const userData: any = {
            name,
            lastName,
            ...username && { username },
            propertyId: propertyId ? Number(propertyId) : null
        };

        if (password) {
            userData.password = await hashPassword(password);
        }

        const profileData = {
            firstName,
            fatherLastName,
            motherLastName,
            phoneNumber,
            email,
            emergencyContact,
            emergencyPhone,
            ineFrontUrl,
            ineBackUrl,
            notes
        };

        const result = await updateResidentUser(Number(id), userData, profileData);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const removeResident = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await deleteResidentUser(Number(id));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};

export const getRelationships = async (req: Request, res: Response) => {
    try {
        const result = await getRelationshipsList();
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
};
