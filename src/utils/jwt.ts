import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

export type UserRole = 'user' | 'admin';
export interface JwtPayloadCore { id: string; role: UserRole; }

export function signJwt(payload: JwtPayloadCore, expiresIn: string | number = '7d') {
  const options: SignOptions = { expiresIn } as SignOptions;
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(token: string): JwtPayloadCore | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayloadCore;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
