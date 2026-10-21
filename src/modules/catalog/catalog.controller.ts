import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import * as catalogService from './catalog.service';

export const getCatalog = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const result = await catalogService.getCatalog(key);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return respondError(res, error);
    }
};
