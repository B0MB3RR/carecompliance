const jwt = require('jsonwebtoken');

/**
 * Verifies the access token and attaches { id, companyId, role } to req.user.
 * Every downstream query MUST filter by req.user.companyId to enforce
 * tenant isolation - never trust a company_id passed in the request body.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing access token.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = {
      id: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      email: payload.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

/**
 * Role-based access control. Usage: requireRole('company_admin', 'super_admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
