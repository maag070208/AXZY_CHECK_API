import { secretKey } from '@src/core/config/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const hashPassword = async (password: string) =>
  await bcrypt.hash(password, 10);

export const comparePassword = async (password: string, hash: string) =>
  await bcrypt.compare(password, hash);

/** Vigencia del token de sesión. Configurable con JWT_EXPIRES_IN (p. ej. "12h"); por defecto 1 día. */
const SESSION_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '1d') as jwt.SignOptions['expiresIn'];

export const generateJWT = async (payload: Record<string, unknown>) =>
  jwt.sign(payload, secretKey, {
    algorithm: 'HS256',
    expiresIn: SESSION_EXPIRES_IN,
  });

export const generateToken = async (email: string) => 
  jwt.sign({email}, secretKey, {
    expiresIn: '1d',
  });

// Algoritmo fijo (S-26): nunca se acepta el que declare el propio token.
export const verifyToken = async (token: string) =>
  jwt.verify(token, secretKey, { algorithms: ['HS256'] });
