import jwt from 'jsonwebtoken';
import { q } from './db.js';

export const sign = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });

export function requireAuth(...roles) {
  return async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    let p;
    try {
      p = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Sign in required' });
    }
    try {
      // Always read the current role and account state from PostgreSQL. A stale JWT
      // must not preserve admin access after a role change or account suspension.
      const { rows } = await q('SELECT id, role, is_active FROM users WHERE id=$1', [p.sub]);
      const user = rows[0];
      if (!user || !user.is_active) return res.status(401).json({ error: 'This account is no longer active. Contact Cönëct support if this is unexpected.' });
      if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
      req.user = { id: user.id, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}
