import express from 'express';
import { verifyToken } from '@src/core/utils/security';

export default async function (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let token = req.header('Authorization');

    if (!token) return res.status(401).json({ msg: 'No token provided' });

    if (token.startsWith('Bearer ')) {
      token = token.slice(7, token.length);
    }

    const decoded = await verifyToken(token);
    res.locals.user = decoded;
    (req as any).user = decoded;
    
    // Shift Validation for Guards
    const user = decoded as any; 
    if (user.role === 'GUARD' || user.role === 'SHIFT' || user.role === 'MAINT') {
        if (user.shiftStart && user.shiftEnd) {
             const dayjs = require('dayjs');
             const customParseFormat = require('dayjs/plugin/customParseFormat');
             dayjs.extend(customParseFormat);
             const now = dayjs();
             const currentStr = now.format('HH:mm');
             const startStr = user.shiftStart;
             const endStr = user.shiftEnd;
             
             let isInShift = false;
             if (endStr < startStr) {
                 isInShift = currentStr >= startStr || currentStr <= endStr;
             } else {
                 isInShift = currentStr >= startStr && currentStr <= endStr;
             }
             
             console.log(`Shift Check: Current ${currentStr}, Start ${startStr}, End ${endStr}, IsInShift ${isInShift}`);
             if (!isInShift) {
                 return res.status(403).json({ msg: 'Fuera de horario de turno' });
             }
        }
    }

    next();
  } catch (error) {
    return res.status(401).json(error);
  }
}
