const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

// ---------------------------------------------------------------------
// Staff records
// ---------------------------------------------------------------------

async function listStaff(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM staff WHERE company_id = $1 ORDER BY last_name, first_name`,
      [req.user.companyId]
    );
    res.json({ staff: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createStaff(req, res, next) {
  const { firstName, lastName, jobTitle, startDate, dbsCertificateNo, dbsIssueDate, dbsExpiryDate, dbsStatus } = req.body;
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO staff (company_id, first_name, last_name, job_title, start_date, dbs_certificate_no, dbs_issue_date, dbs_expiry_date, dbs_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'not_started'))
       RETURNING *`,
      [req.user.companyId, firstName, lastName, jobTitle || null, startDate || null, dbsCertificateNo || null, dbsIssueDate || null, dbsExpiryDate || null, dbsStatus]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'staff_created',
      entityType: 'staff',
      entityId: result.rows[0].id,
      ipAddress: req.ip,
    });

    res.status(201).json({ staff: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateStaff(req, res, next) {
  const { id } = req.params;
  const { firstName, lastName, jobTitle, employmentStatus, endDate, dbsCertificateNo, dbsIssueDate, dbsExpiryDate, dbsStatus } = req.body;

  try {
    const result = await query(
      `UPDATE staff SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        job_title = COALESCE($3, job_title),
        employment_status = COALESCE($4, employment_status),
        end_date = COALESCE($5, end_date),
        dbs_certificate_no = COALESCE($6, dbs_certificate_no),
        dbs_issue_date = COALESCE($7, dbs_issue_date),
        dbs_expiry_date = COALESCE($8, dbs_expiry_date),
        dbs_status = COALESCE($9, dbs_status)
       WHERE id = $10 AND company_id = $11
       RETURNING *`,
      [firstName, lastName, jobTitle, employmentStatus, endDate, dbsCertificateNo, dbsIssueDate, dbsExpiryDate, dbsStatus, id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Staff record not found.' });

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'staff_updated',
      entityType: 'staff',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ staff: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Training course types
// ---------------------------------------------------------------------

async function listCourseTypes(req, res, next) {
  try {
    const result = await query(
      'SELECT * FROM training_course_types WHERE company_id = $1 AND is_active = true ORDER BY name',
      [req.user.companyId]
    );
    res.json({ courseTypes: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createCourseType(req, res, next) {
  const { name, isMandatory, renewalPeriodMonths } = req.body;
  if (!name) return res.status(400).json({ error: 'Course name is required.' });

  try {
    // Re-activate a previously removed course of the same name instead of
    // hitting the unique constraint, so a company can un-remove a course.
    const result = await query(
      `INSERT INTO training_course_types (company_id, name, is_mandatory, renewal_period_months)
       VALUES ($1, $2, COALESCE($3, true), $4)
       ON CONFLICT (company_id, name) DO UPDATE SET
         is_active = true, is_mandatory = COALESCE($3, training_course_types.is_mandatory),
         renewal_period_months = COALESCE($4, training_course_types.renewal_period_months)
       RETURNING *`,
      [req.user.companyId, name, isMandatory, renewalPeriodMonths || null]
    );
    res.status(201).json({ courseType: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * "Removing" a course deactivates it rather than deleting the row, so
 * historical training records logged against it (and any certificates
 * attached to them) are preserved for audit purposes.
 */
async function deactivateCourseType(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE training_course_types SET is_active = false WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'training_course_removed',
      entityType: 'training_course_type',
      entityId: id,
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Training records (the matrix itself)
// ---------------------------------------------------------------------

/**
 * Returns every staff member x every mandatory course type, joined against
 * their most recent completion, so the frontend can render a full matrix
 * grid including cells where training has never been recorded.
 */
async function getTrainingMatrix(req, res, next) {
  try {
    const result = await query(
      `SELECT
         s.id AS staff_id, s.first_name, s.last_name, s.job_title,
         c.id AS course_type_id, c.name AS course_name, c.is_mandatory, c.renewal_period_months,
         latest.completed_date, latest.expiry_date, latest.record_id
       FROM staff s
       CROSS JOIN training_course_types c
       LEFT JOIN LATERAL (
         SELECT r.id AS record_id, r.completed_date, r.expiry_date
         FROM staff_training_records r
         WHERE r.staff_id = s.id AND r.course_type_id = c.id
         ORDER BY r.completed_date DESC
         LIMIT 1
       ) latest ON true
       WHERE s.company_id = $1 AND c.company_id = $1 AND s.employment_status = 'active' AND c.is_active = true
       ORDER BY s.last_name, s.first_name, c.name`,
      [req.user.companyId]
    );
    res.json({ matrix: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createTrainingRecord(req, res, next) {
  const { staffId, courseTypeId, completedDate, expiryDate, notes } = req.body;
  if (!staffId || !courseTypeId || !completedDate) {
    return res.status(400).json({ error: 'staffId, courseTypeId and completedDate are required.' });
  }

  try {
    // Auto-calculate expiry from the course type's renewal period if not given.
    let finalExpiry = expiryDate || null;
    if (!finalExpiry) {
      const courseResult = await query(
        'SELECT renewal_period_months FROM training_course_types WHERE id = $1 AND company_id = $2',
        [courseTypeId, req.user.companyId]
      );
      const months = courseResult.rows[0]?.renewal_period_months;
      if (months) {
        const d = new Date(completedDate);
        d.setMonth(d.getMonth() + months);
        finalExpiry = d.toISOString().split('T')[0];
      }
    }

    const result = await query(
      `INSERT INTO staff_training_records (company_id, staff_id, course_type_id, completed_date, expiry_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.companyId, staffId, courseTypeId, completedDate, finalExpiry, notes || null]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'training_record_created',
      entityType: 'staff_training_record',
      entityId: result.rows[0].id,
      ipAddress: req.ip,
    });

    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Supervision records
// ---------------------------------------------------------------------

async function listSupervisions(req, res, next) {
  const { staffId } = req.query;
  const conditions = ['company_id = $1'];
  const params = [req.user.companyId];
  if (staffId) {
    params.push(staffId);
    conditions.push(`staff_id = $${params.length}`);
  }

  try {
    const result = await query(
      `SELECT * FROM supervision_records WHERE ${conditions.join(' AND ')} ORDER BY supervision_date DESC`,
      params
    );
    res.json({ supervisions: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createSupervision(req, res, next) {
  const { staffId, supervisionDate, nextDueDate, notes } = req.body;
  if (!staffId || !supervisionDate) {
    return res.status(400).json({ error: 'staffId and supervisionDate are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO supervision_records (company_id, staff_id, supervision_date, next_due_date, conducted_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.companyId, staffId, supervisionDate, nextDueDate || null, req.user.id, notes || null]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'supervision_recorded',
      entityType: 'supervision_record',
      entityId: result.rows[0].id,
      ipAddress: req.ip,
    });

    res.status(201).json({ supervision: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  listCourseTypes,
  createCourseType,
  deactivateCourseType,
  getTrainingMatrix,
  createTrainingRecord,
  listSupervisions,
  createSupervision,
};
