const { query } = require('../config/db');

async function listAuditLog(req, res, next) {
  const { entityType, from, to, limit } = req.query;
  const conditions = ['a.company_id = $1'];
  const params = [req.user.companyId];

  if (entityType) {
    params.push(entityType);
    conditions.push(`a.entity_type = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`a.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`a.created_at <= $${params.length}`);
  }

  const rowLimit = Math.min(Number(limit) || 100, 500);

  try {
    const result = await query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
              u.first_name, u.last_name, u.email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ${rowLimit}`,
      params
    );
    res.json({ auditLog: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLog };
