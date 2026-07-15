const jwt = require('jsonwebtoken');
const logger = require('../utils/logger'); 

function maskEmail(email) {
  if (!email) return 'unknown';
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;
  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  if (local.length <= 3) {
    return '***' + domain;
  }
  return local.substring(0, 3) + '***' + domain;
}

function requireAuth(req, res, next) {
  let token = req.cookies?.token;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.warn(
      { ip: req.ip, path: req.path },
      'Authentication failed: No token provided'
    );
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    logger.info(
      {
        userId: decoded.id || decoded.sub || 'unknown',
        email: decoded.email ? maskEmail(decoded.email) : 'unknown',
        ip: req.ip,
        path: req.path,
      },
      'User authenticated successfully'
    );

    next();
  } catch (error) {
    let errorType = 'Invalid or expired token';
    if (error.name === 'TokenExpiredError') {
      errorType = 'Token expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorType = 'Invalid token signature/malformed';
    }

    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        error: errorType,
        tokenPreview: token.substring(0, 10) + '...', 
      },
      `Authentication failed: ${errorType}`
    );

    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;