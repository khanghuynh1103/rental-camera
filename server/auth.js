import crypto from 'node:crypto';
import { query } from './db.js';

const ttl = 7 * 24 * 60 * 60 * 1000;
const tokenHash = token =>
  crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex');

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex'),
    expiresAt = new Date(Date.now() + ttl);
  await query('DELETE FROM user_sessions WHERE expires_at<=NOW()');
  await query('INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [
    userId,
    tokenHash(token),
    expiresAt
  ]);
  return token;
}

export async function destroySession(token) {
  if (token) await query('DELETE FROM user_sessions WHERE token_hash=$1', [tokenHash(token)]);
}

export async function currentUser(req) {
  const token = req.cookies.session;
  if (!token) return null;
  const result = await query(
    `SELECT u.id,u.full_name AS "fullName",u.email,u.phone,u.role,u.created_at AS "createdAt"
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW()`,
    [tokenHash(token)]
  );
  if (!result.rowCount) {
    await destroySession(token);
    return null;
  }
  await query('UPDATE user_sessions SET last_used_at=NOW() WHERE token_hash=$1', [tokenHash(token)]);
  return result.rows[0];
}

export async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ message: 'Bạn cần đăng nhập để tiếp tục.' });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.' });

export const sessionOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: ttl,
  path: '/'
};
