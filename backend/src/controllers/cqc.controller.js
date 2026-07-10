const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

const KLOES = ['safe', 'effective', 'caring', 'responsive', 'well_led'];

// ---------------------------------------------------------------------
// Evidence library
// ---------------------------------------------------------------------

async function listEvidence(req, res, next) {
  try {
    const result = await query(
      `SELECT e.*, d.original_name AS document_name
       FROM cqc_evidence_items e
       LEFT JOIN documents d ON d.id = e.document_id
       WHERE e.company_id = $1 ORDER BY e.kloe, e.title`,
      [req.user.companyId]
    );
    res.json({ evidence: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createEvidence(req, res, next) {
  const { kloe, title, description, documentId, status } = req.body;
  if (!kloe || !title || !KLOES.includes(kloe)) {
    return res.status(400).json({ error: 'A valid kloe and title are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO cqc_evidence_items (company_id, kloe, title, description, document_id, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'not_started')) RETURNING *`,
      [req.user.companyId, kloe, title, description || null, documentId || null, status]
    );
    res.status(201).json({ evidence: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateEvidence(req, res, next) {
  const { id } = req.params;
  const { title, description, documentId, status } = req.body;

  try {
    const result = await query(
      `UPDATE cqc_evidence_items SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        document_id = COALESCE($3, document_id),
        status = COALESCE($4, status)
       WHERE id = $5 AND company_id = $6
       RETURNING *`,
      [title, description, documentId, status, id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Evidence item not found.' });
    res.json({ evidence: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Action plan
// ---------------------------------------------------------------------

async function listActionItems(req, res, next) {
  try {
    const result = await query(
      `SELECT a.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
       FROM cqc_action_items a
       LEFT JOIN users u ON u.id = a.owner_user_id
       WHERE a.company_id = $1 ORDER BY
         CASE a.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         a.due_date NULLS LAST`,
      [req.user.companyId]
    );
    res.json({ actionItems: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createActionItem(req, res, next) {
  const { kloe, title, description, ownerUserId, priority, dueDate } = req.body;
  if (!kloe || !title || !KLOES.includes(kloe)) {
    return res.status(400).json({ error: 'A valid kloe and title are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO cqc_action_items (company_id, kloe, title, description, owner_user_id, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'medium'), $7) RETURNING *`,
      [req.user.companyId, kloe, title, description || null, ownerUserId || null, priority, dueDate || null]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'cqc_action_item_created',
      entityType: 'cqc_action_item',
      entityId: result.rows[0].id,
      ipAddress: req.ip,
    });

    res.status(201).json({ actionItem: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateActionItem(req, res, next) {
  const { id } = req.params;
  const { status, priority, dueDate, ownerUserId } = req.body;
  const completedDate = status === 'completed' ? new Date().toISOString().split('T')[0] : null;

  try {
    const result = await query(
      `UPDATE cqc_action_items SET
        status = COALESCE($1, status),
        priority = COALESCE($2, priority),
        due_date = COALESCE($3, due_date),
        owner_user_id = COALESCE($4, owner_user_id),
        completed_date = CASE WHEN $1 = 'completed' THEN $5 WHEN $1 IS NOT NULL THEN NULL ELSE completed_date END
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [status, priority, dueDate, ownerUserId, completedDate, id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Action item not found.' });

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'cqc_action_item_updated',
      entityType: 'cqc_action_item',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ actionItem: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------

/**
 * A simple, explainable readiness score per KLOE: the share of evidence
 * items marked "ready", minus a penalty for open/overdue action items.
 * This is intentionally transparent (not a black-box score) so a manager
 * can see exactly why a KLOE is scored the way it is.
 */
async function getReadinessScore(req, res, next) {
  try {
    const evidenceResult = await query(
      `SELECT kloe, status, COUNT(*)::int AS count FROM cqc_evidence_items
       WHERE company_id = $1 GROUP BY kloe, status`,
      [req.user.companyId]
    );
    const actionResult = await query(
      `SELECT kloe, status, due_date FROM cqc_action_items WHERE company_id = $1 AND status != 'completed'`,
      [req.user.companyId]
    );

    const today = new Date().toISOString().split('T')[0];
    const scores = {};
    KLOES.forEach((k) => {
      scores[k] = { kloe: k, totalEvidence: 0, readyEvidence: 0, openActions: 0, overdueActions: 0, score: 0 };
    });

    evidenceResult.rows.forEach((row) => {
      const s = scores[row.kloe];
      if (!s) return;
      s.totalEvidence += row.count;
      if (row.status === 'ready') s.readyEvidence += row.count;
    });

    actionResult.rows.forEach((row) => {
      const s = scores[row.kloe];
      if (!s) return;
      s.openActions += 1;
      if (row.due_date && row.due_date.toISOString().split('T')[0] < today) s.overdueActions += 1;
    });

    Object.values(scores).forEach((s) => {
      const evidenceScore = s.totalEvidence === 0 ? 0 : (s.readyEvidence / s.totalEvidence) * 100;
      const penalty = s.overdueActions * 10 + Math.max(0, s.openActions - s.overdueActions) * 3;
      s.score = Math.max(0, Math.round(evidenceScore - penalty));
    });

    const overall = Math.round(Object.values(scores).reduce((sum, s) => sum + s.score, 0) / KLOES.length);

    res.json({ overallScore: overall, kloeScores: Object.values(scores) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listEvidence,
  createEvidence,
  updateEvidence,
  listActionItems,
  createActionItem,
  updateActionItem,
  getReadinessScore,
};
