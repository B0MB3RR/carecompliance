const { query } = require('../config/db');

/**
 * Records an entry in the audit trail. Call this from controllers after
 * any create/update/delete/login action that matters for compliance.
 */
async function recordAudit({ companyId, userId, action, entityType = null, entityId = null, metadata = null, ipAddress = null }) {
  await query(
    `INSERT INTO audit_log (company_id, user_id, action, entity_type, entity_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [companyId, userId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, ipAddress]
  );
}

module.exports = { recordAudit };
