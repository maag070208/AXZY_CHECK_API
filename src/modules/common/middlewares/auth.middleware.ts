
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../../core/utils/security';
import { createTResult } from '../../../core/mappers/tresult.mapper';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json(createTResult(null, ['No token provided']));
        }

        const token = authHeader.split(' ')[1]; 
        if (!token) {
            return res.status(401).json(createTResult(null, ['Invalid token format']));
        }

        const decoded = await verifyToken(token);
        // @ts-ignore
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json(createTResult(null, ['Invalid or expired token']));
    }
};
