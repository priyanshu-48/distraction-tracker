import jwt from 'jsonwebtoken';
import db from '../db.js';

const deny = (res, error, message = 'Please login again') => res.status(401).json({ error, message });

export default async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers['authorization'] || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Bearer token missing from Authorization header'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.id) throw new Error('Token payload missing user ID');
  } catch (err) {
    return deny(res, err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token');
  }

  // A token outlives the account it was issued for (it lasts a day), so a deleted account must be turned away here,
  // not only when a query happens to fail. One primary-key lookup.
  const { rowCount } = await db.query('SELECT 1 FROM users WHERE id = $1', [decoded.id]);
  if (rowCount === 0) return deny(res, 'Account not found');

  req.user = decoded;
  next();
}
