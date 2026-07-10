const { query } = require('../config/db');

const EXPIRY_WARNING_DAYS = 60;

/**
 * Computes "expiring soon / overdue" compliance alerts on the fly, rather
 * than persisting them, so they're always accurate against current dates
 * without needing a scheduled job. Covers DBS checks, training records,
 * staff supervisions, and open CQC action items.
 */
async function getComplianceAlerts(companyId) {
  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + EXPIRY_WARNING_DAYS);
  const warningDateStr = warningDate.toISOString().split('T')[0];

  const [expiringDbs, expiringTraining, overdueSupervisions, overdueActions] = await Promise.all([
    query(
      `SELECT id, first_name, last_name, dbs_expiry_date FROM staff
       WHERE company_id = $1 AND employment_status = 'active' AND dbs_expiry_date IS NOT NULL AND dbs_expiry_date <= $2
       ORDER BY dbs_expiry_date`,
      [companyId, warningDateStr]
    ),
    query(
      `SELECT DISTINCT ON (r.staff_id, r.course_type_id) r.id, s.first_name, s.last_name, c.name AS course_name, r.expiry_date
       FROM staff_training_records r
       JOIN staff s ON s.id = r.staff_id
       JOIN training_course_types c ON c.id = r.course_type_id
       WHERE r.company_id = $1 AND s.employment_status = 'active' AND r.expiry_date IS NOT NULL AND r.expiry_date <= $2
       ORDER BY r.staff_id, r.course_type_id, r.completed_date DESC`,
      [companyId, warningDateStr]
    ),
    query(
      `SELECT id, first_name, last_name FROM staff s
       WHERE company_id = $1 AND employment_status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM supervision_records sr
         WHERE sr.staff_id = s.id AND sr.next_due_date IS NOT NULL AND sr.next_due_date > CURRENT_DATE
       )`,
      [companyId]
    ),
    query(
      `SELECT id, title, kloe, due_date FROM cqc_action_items
       WHERE company_id = $1 AND status != 'completed' AND due_date IS NOT NULL AND due_date <= CURRENT_DATE`,
      [companyId]
    ),
  ]);

  return {
    expiringDbs: expiringDbs.rows,
    expiringTraining: expiringTraining.rows,
    staffOverdueSupervision: overdueSupervisions.rows,
    overdueCqcActions: overdueActions.rows,
  };
}

/**
 * Aggregates the data the dashboard's summary cards and alert feed need
 * into a single response, to minimise round trips from the frontend.
 */
async function getSummary(req, res, next) {
  const companyId = req.user.companyId;

  try {
    const [documentsCount, activeUsersCount, unreadAlerts, latestMetrics, recentAlerts, activeStaffCount, openIncidents, readinessScore, complianceAlerts] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM documents WHERE company_id = $1', [companyId]),
      query('SELECT COUNT(*)::int AS count FROM users WHERE company_id = $1 AND is_active = true', [companyId]),
      query('SELECT COUNT(*)::int AS count FROM alerts WHERE company_id = $1 AND is_read = false', [companyId]),
      query(
        `SELECT DISTINCT ON (m.id) m.id, m.display_name, m.unit, m.target_value, m.direction,
                r.recorded_value, r.record_date
         FROM operational_metric_definitions m
         LEFT JOIN operational_records r ON r.metric_definition_id = m.id
         WHERE m.company_id = $1 AND m.is_active = true
         ORDER BY m.id, r.record_date DESC NULLS LAST`,
        [companyId]
      ),
      query(
        `SELECT id, severity, title, message, is_read, created_at FROM alerts
         WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [companyId]
      ),
      query(`SELECT COUNT(*)::int AS count FROM staff WHERE company_id = $1 AND employment_status = 'active'`, [companyId]),
      query(`SELECT COUNT(*)::int AS count FROM incidents WHERE company_id = $1 AND status != 'closed'`, [companyId]),
      query(
        `SELECT COALESCE(AVG(CASE WHEN status = 'ready' THEN 100 ELSE 0 END), 0)::int AS score
         FROM cqc_evidence_items WHERE company_id = $1`,
        [companyId]
      ),
      getComplianceAlerts(companyId),
    ]);

    res.json({
      documentsCount: documentsCount.rows[0].count,
      activeUsersCount: activeUsersCount.rows[0].count,
      unreadAlertsCount: unreadAlerts.rows[0].count,
      metrics: latestMetrics.rows,
      recentAlerts: recentAlerts.rows,
      activeStaffCount: activeStaffCount.rows[0].count,
      openIncidentsCount: openIncidents.rows[0].count,
      cqcEvidenceReadinessPct: readinessScore.rows[0].score,
      complianceAlerts,
    });
  } catch (err) {
    next(err);
  }
}

async function markAlertRead(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      'UPDATE alerts SET is_read = true WHERE id = $1 AND company_id = $2 RETURNING id',
      [id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Powers the analytics panels on the dashboard: incident trend over time,
 * training compliance by course, and CQC readiness by KLOE. Grouped into
 * one endpoint to keep the dashboard to a small, predictable number of
 * requests rather than one per chart.
 */
async function getAnalytics(req, res, next) {
  const companyId = req.user.companyId;

  try {
    const [incidentsByMonth, trainingByCourse, evidenceByKloe, actionsByKloe] = await Promise.all([
      query(
        `SELECT to_char(date_trunc('month', incident_date), 'YYYY-MM') AS month,
                severity, COUNT(*)::int AS count
         FROM incidents
         WHERE company_id = $1 AND incident_date >= CURRENT_DATE - INTERVAL '6 months'
         GROUP BY month, severity
         ORDER BY month`,
        [companyId]
      ),
      query(
        `SELECT c.name AS course_name,
                COUNT(DISTINCT s.id)::int AS total_staff,
                COUNT(DISTINCT CASE WHEN r.expiry_date IS NULL OR r.expiry_date > CURRENT_DATE THEN s.id END)::int AS compliant_staff
         FROM training_course_types c
         CROSS JOIN staff s
         LEFT JOIN LATERAL (
           SELECT expiry_date FROM staff_training_records tr
           WHERE tr.staff_id = s.id AND tr.course_type_id = c.id
           ORDER BY tr.completed_date DESC LIMIT 1
         ) r ON true
         WHERE c.company_id = $1 AND s.company_id = $1 AND s.employment_status = 'active' AND c.is_mandatory = true
         GROUP BY c.name
         ORDER BY c.name`,
        [companyId]
      ),
      query(
        `SELECT kloe, status, COUNT(*)::int AS count FROM cqc_evidence_items
         WHERE company_id = $1 GROUP BY kloe, status`,
        [companyId]
      ),
      query(
        `SELECT kloe, COUNT(*)::int AS count FROM cqc_action_items
         WHERE company_id = $1 AND status != 'completed' GROUP BY kloe`,
        [companyId]
      ),
    ]);

    // Reshape evidence-by-status into a 0-100 readiness score per KLOE,
    // matching the same explainable formula used on the CQC Readiness page.
    const KLOES = ['safe', 'effective', 'caring', 'responsive', 'well_led'];
    const kloeMap = {};
    KLOES.forEach((k) => { kloeMap[k] = { kloe: k, total: 0, ready: 0, openActions: 0 }; });
    evidenceByKloe.rows.forEach((row) => {
      kloeMap[row.kloe].total += row.count;
      if (row.status === 'ready') kloeMap[row.kloe].ready += row.count;
    });
    actionsByKloe.rows.forEach((row) => { kloeMap[row.kloe].openActions = row.count; });
    const readinessByKloe = KLOES.map((k) => {
      const d = kloeMap[k];
      const base = d.total === 0 ? 0 : (d.ready / d.total) * 100;
      const score = Math.max(0, Math.round(base - d.openActions * 5));
      return { kloe: k, score };
    });

    res.json({
      incidentsByMonth: incidentsByMonth.rows,
      trainingByCourse: trainingByCourse.rows.map((r) => ({
        courseName: r.course_name,
        compliancePct: r.total_staff === 0 ? 100 : Math.round((r.compliant_staff / r.total_staff) * 100),
      })),
      readinessByKloe,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, markAlertRead, getAnalytics, getUpcomingCalendar };

/**
 * Compliance Calendar: every upcoming deadline the company is responsible
 * for, in one chronological list - DBS renewals, training expiries,
 * supervision due dates, CQC action deadlines, and document expiries (e.g.
 * insurance certificates, policy reviews). Wider window than the dashboard's
 * 60-day alert threshold, since this is meant for forward planning rather
 * than urgent triage.
 */
async function getUpcomingCalendar(req, res, next) {
  const companyId = req.user.companyId;
  const windowDays = Math.min(Number(req.query.days) || 120, 365);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + windowDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  try {
    const [dbs, training, supervisions, actions, documents] = await Promise.all([
      query(
        `SELECT id, first_name, last_name, dbs_expiry_date AS due_date FROM staff
         WHERE company_id = $1 AND employment_status = 'active' AND dbs_expiry_date IS NOT NULL AND dbs_expiry_date <= $2
         ORDER BY dbs_expiry_date`,
        [companyId, cutoffStr]
      ),
      query(
        `SELECT DISTINCT ON (r.staff_id, r.course_type_id) r.id, s.first_name, s.last_name, c.name AS course_name, r.expiry_date AS due_date
         FROM staff_training_records r
         JOIN staff s ON s.id = r.staff_id
         JOIN training_course_types c ON c.id = r.course_type_id
         WHERE r.company_id = $1 AND s.employment_status = 'active' AND r.expiry_date IS NOT NULL AND r.expiry_date <= $2
         ORDER BY r.staff_id, r.course_type_id, r.completed_date DESC`,
        [companyId, cutoffStr]
      ),
      query(
        `SELECT DISTINCT ON (staff_id) id, staff_id, next_due_date AS due_date FROM supervision_records
         WHERE company_id = $1 AND next_due_date IS NOT NULL AND next_due_date <= $2
         ORDER BY staff_id, supervision_date DESC`,
        [companyId, cutoffStr]
      ),
      query(
        `SELECT id, title, kloe, due_date FROM cqc_action_items
         WHERE company_id = $1 AND status != 'completed' AND due_date IS NOT NULL AND due_date <= $2`,
        [companyId, cutoffStr]
      ),
      query(
        `SELECT id, original_name, expiry_date AS due_date FROM documents
         WHERE company_id = $1 AND expiry_date IS NOT NULL AND expiry_date <= $2`,
        [companyId, cutoffStr]
      ),
    ]);

    // Join supervision rows against staff names separately, since the
    // DISTINCT ON query above only has staff_id.
    let supervisionRows = supervisions.rows;
    if (supervisionRows.length > 0) {
      const staffIds = supervisionRows.map((r) => r.staff_id);
      const staffResult = await query(
        `SELECT id, first_name, last_name FROM staff WHERE id = ANY($1::uuid[])`,
        [staffIds]
      );
      const staffById = Object.fromEntries(staffResult.rows.map((s) => [s.id, s]));
      supervisionRows = supervisionRows.map((r) => ({ ...r, staff: staffById[r.staff_id] }));
    }

    const today = new Date().toISOString().split('T')[0];
    const events = [
      ...dbs.rows.map((r) => ({ type: 'dbs', dueDate: r.due_date, title: `DBS check — ${r.first_name} ${r.last_name}` })),
      ...training.rows.map((r) => ({ type: 'training', dueDate: r.due_date, title: `${r.course_name} — ${r.first_name} ${r.last_name}` })),
      ...supervisionRows.map((r) => ({ type: 'supervision', dueDate: r.due_date, title: `Supervision due — ${r.staff ? `${r.staff.first_name} ${r.staff.last_name}` : 'Staff member'}` })),
      ...actions.rows.map((r) => ({ type: 'cqc_action', dueDate: r.due_date, title: `CQC action — ${r.title}`, meta: r.kloe })),
      ...documents.rows.map((r) => ({ type: 'document', dueDate: r.due_date, title: `Document expiring — ${r.original_name}` })),
    ]
      .map((e) => ({ ...e, isOverdue: e.dueDate.toISOString().split('T')[0] < today }))
      .sort((a, b) => a.dueDate - b.dueDate);

    res.json({ windowDays, events });
  } catch (err) {
    next(err);
  }
}
