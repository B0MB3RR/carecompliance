const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

async function listMetricDefinitions(req, res, next) {
  try {
    const result = await query(
      'SELECT * FROM operational_metric_definitions WHERE company_id = $1 AND is_active = true ORDER BY display_name',
      [req.user.companyId]
    );
    res.json({ metrics: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createMetricDefinition(req, res, next) {
  const { metricKey, displayName, unit, targetValue, direction } = req.body;
  if (!metricKey || !displayName) {
    return res.status(400).json({ error: 'metricKey and displayName are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO operational_metric_definitions (company_id, metric_key, display_name, unit, target_value, direction)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'lower_better'))
       RETURNING *`,
      [req.user.companyId, metricKey, displayName, unit || null, targetValue || null, direction]
    );
    res.status(201).json({ metric: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A metric with that key already exists.' });
    next(err);
  }
}

/**
 * Records a new data point against a metric definition (data entry form
 * submission on the frontend).
 */
async function createRecord(req, res, next) {
  const { metricDefinitionId, recordedValue, recordDate, notes } = req.body;
  if (!metricDefinitionId || recordedValue === undefined || !recordDate) {
    return res.status(400).json({ error: 'metricDefinitionId, recordedValue and recordDate are required.' });
  }

  try {
    // Confirm the metric definition belongs to this tenant before inserting.
    const defCheck = await query(
      'SELECT id FROM operational_metric_definitions WHERE id = $1 AND company_id = $2',
      [metricDefinitionId, req.user.companyId]
    );
    if (defCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Metric definition not found.' });
    }

    const result = await query(
      `INSERT INTO operational_records (company_id, metric_definition_id, recorded_value, record_date, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.companyId, metricDefinitionId, recordedValue, recordDate, notes || null, req.user.id]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'operational_record_created',
      entityType: 'operational_record',
      entityId: result.rows[0].id,
      ipAddress: req.ip,
    });

    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns historical records for a metric, optionally bounded by date range,
 * for trend charts on the dashboard / operational data screens.
 */
async function listRecords(req, res, next) {
  const { metricDefinitionId, from, to } = req.query;
  const conditions = ['company_id = $1'];
  const params = [req.user.companyId];

  if (metricDefinitionId) {
    params.push(metricDefinitionId);
    conditions.push(`metric_definition_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`record_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`record_date <= $${params.length}`);
  }

  try {
    const result = await query(
      `SELECT * FROM operational_records WHERE ${conditions.join(' AND ')} ORDER BY record_date DESC LIMIT 500`,
      params
    );
    res.json({ records: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMetricDefinitions, createMetricDefinition, createRecord, listRecords };
