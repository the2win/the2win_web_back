import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'the2win_token';
export function signJwt(payload, expiresIn = '7d') {
    const options = { expiresIn };
    return jwt.sign(payload, JWT_SECRET, options);
}
export function verifyJwt(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
export { COOKIE_NAME };
