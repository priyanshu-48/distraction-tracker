import jwt from 'jsonwebtoken';

export default function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Authorization header missing' 
    });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Bearer token missing from Authorization header' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.id) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token payload missing user ID' 
      });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Please login again' 
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        error: 'Invalid token',
        message: 'Token is malformed or invalid' 
      });
    }
    
    return res.status(403).json({ 
      error: 'Authentication failed',
      message: 'Invalid token' 
    });
  }
}
