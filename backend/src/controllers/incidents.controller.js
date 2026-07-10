const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

async function listIncidents(req, res, next) {
  const { status, severity } = req.query;
  const conditions = ['i.company_id = $1'];
  const params = [req.user.companyId];

  if (status) {
    params.push(status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`i.severity = $${params.length}`);
  }

  try {
    const result = await query(
      `SELECT i.*, u.first_name AS reported_by_first_name, u.last_name AS reported_by_last_name
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reported_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.incident_date DESC, i.created_at DESC`,
      params
    );
    res.json({ incidents: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createIncident(req, res, next) {
  const { incidentType, severity, incidentDate, description, clientRelated, staffInvolved, actionsTaken, notifiableToCqc } = req.body;
  if (!incidentType || !incidentDate || !description) {
    return res.status(400).json({ error: 'incidentType, incidentDate and description are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO incidents
        (company_id, incident_type, severity, incident_date, description, client_related, staff_involved, actions_taken, notifiable_to_cqc, reported_by)
       VALUES ($1, $2, COALESCE($3, 'low'), $4, $5, COALESCE($6, true), $7, $8, COALESCE($9, false), $10)
       RETURNING *`,
      [
        req.user.companyId, incidentType, severity, incidentDate, description,
        clientRelated, staffInvolved || null, actionsTaken || null, notifiableToCqc, req.user.id,
      ]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'incident_logged',
      entityType: 'incident',
      entityId: result.rows[0].id,
      metadata: { incidentType, severity },
      ipAddress: req.ip,
    });

    // Critical/high severity incidents automatically raise a dashboard alert
    // so nothing serious sits unnoticed in the register.
    if (['high', 'critical'].includes(result.rows[0].severity)) {
      await query(
        `INSERT INTO alerts (company_id, severity, title, message, source)
         VALUES ($1, $2, $3, $4, 'incident')`,
        [
          req.user.companyId,
          result.rows[0].severity === 'critical' ? 'critical' : 'warning',
          `${result.rows[0].severity === 'critical' ? 'Critical' : 'High severity'} incident logged`,
          description.slice(0, 200),
        ]
      );
    }

    res.status(201).json({ incident: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateIncident(req, res, next) {
  const { id } = req.params;
  const { status, actionsTaken, closedDate } = req.body;
  const finalClosedDate = status === 'closed' ? (closedDate || new Date().toISOString().split('T')[0]) : null;

  try {
    const result = await query(
      `UPDATE incidents SET
        status = COALESCE($1, status),
        actions_taken = COALESCE($2, actions_taken),
        closed_date = CASE WHEN $1 = 'closed' THEN $3 WHEN $1 IS NOT NULL THEN NULL ELSE closed_date END
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [status, actionsTaken, finalClosedDate, id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found.' });

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'incident_updated',
      entityType: 'incident',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ incident: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { listIncidents, createIncident, updateIncident };
