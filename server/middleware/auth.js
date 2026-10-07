import jwt from 'jsonwebtoken';
import db from '../db.js';
import { COOKIE_NAME, CSRF_HEADER, CSRF_VALUE, SAFE_METHODS, SCOPES, parseCookies } from '../domain/session.js';

const deny = (res, error, message = 'Please login again') => res.status(401).json({ error, message });

/**
 * Builds the middleware that decides who is calling. The credential is the same signed token either way: an
 * `Authorization: Bearer` header (the extension, scripts, tests) or the httpOnly session cookie (the dashboard).
 *
 *  - The user must still exist and the token's version must match the user's, so deleting an account or logging
 *    out (which bumps the version) ends every token issued before.
 *  - `allowed` lists the token scopes a route accepts. Most routes take only "user"; the two the extension calls
 *    also take "ingest", which cannot read data or delete anything.
 *  - A request authenticated by the cookie that changes something must carry `X-Requested-With: dt`. A page on
 *    another site cannot add that header without a CORS preflight that the origin allowlist refuses.
 */
function requireAuth(allowed) {
  return async function authenticate(req, res, next) {
    const [scheme, bearer] = (req.headers['authorization'] || '').split(' ');
    const fromHeader = scheme === 'Bearer' && bearer ? bearer : null;
    const token = fromHeader ?? parseCookies(req.headers.cookie)[COOKIE_NAME];
    const via = fromHeader ? 'bearer' : 'cookie';

    if (!token) {
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

    // One primary-key lookup answers both "does the account still exist" and "was this token revoked".
    const { rows } = await db.query('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
    if (rows.length === 0) return deny(res, 'Account not found');
    if ((decoded.v ?? 0) !== rows[0].token_version) return deny(res, 'Session ended');

    const scope = decoded.scope ?? SCOPES.user; // tokens issued before scopes existed are full tokens
    if (!allowed.includes(scope)) {
      return res.status(403).json({ error: 'Insufficient scope', message: 'This token cannot be used for this request' });
    }

    if (via === 'cookie' && !SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      return res.status(403).json({ error: 'Request not allowed', message: `Missing ${CSRF_HEADER} header` });
    }

    req.user = decoded;
    req.authVia = via;
    next();
  };
}

/** The default: a full user token only. */
export default requireAuth([SCOPES.user]);
/** For the two routes the extension calls: a user token, or the extension's limited one. */
export const authenticateIngest = requireAuth([SCOPES.user, SCOPES.ingest]);
