// middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function verifyToken(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'No token provided' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(403).json({ error: 'Malformed token' });
  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Normalize user_id to number and role to uppercase string
    req.user = {
      user_id: Number(decoded.user_id),
      role: String(decoded.role || '').toUpperCase()
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(expectedRole) {
  const roleUpper = String(expectedRole || '').toUpperCase();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role !== roleUpper) return res.status(401).json({ error: 'Forbidden: insufficient role' });
    return next();
  };
}

module.exports = { verifyToken, requireRole };
