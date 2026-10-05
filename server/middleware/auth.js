import jwt from 'jsonwebtoken';

export default function authenticate(req, res, next) {
  const [scheme, token] = (req.headers['authorization'] || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Bearer token missing from Authorization header'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.id) throw new Error('Token payload missing user ID');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      message: 'Please login again'
    });
  }
}
