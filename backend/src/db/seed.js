/**
 * Seeds a demo company, admin user, metric definitions and a couple of
 * sample alerts so the dashboard has something to show on first run.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const companyRes = await client.query(
      `INSERT INTO companies (registration_id, name, provider_type, cqc_registration_no, city, postcode)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['CCI-DEMO1', 'Demo Home Care Ltd', 'home_care', 'CQC-DEMO-0001', 'Stockport', 'SK1 1AA']
    );
    const companyId = companyRes.rows[0].id;

    const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
    await client.query(
      `INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, 'admin@democare.co.uk', passwordHash, 'Demo', 'Admin', 'company_admin']
    );

    // Platform-level super_admin account (CareCompliance Intelligence staff,
    // not a customer) - logs in without a registration ID, since
    // company_id is NULL. This is who uses the internal onboarding portal
    // to register new customer companies.
    const platformPasswordHash = await bcrypt.hash('PlatformChangeMe123!', 12);
    await client.query(
      `INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
       VALUES (NULL, $1, $2, $3, $4, 'super_admin')`,
      ['platform-admin@carecomplianceintelligence.co.uk', platformPasswordHash, 'Platform', 'Admin']
    );

    const metrics = [
      ['incidents_reported', 'Incidents Reported', 'count', 0, 'lower_better'],
      ['medication_errors', 'Medication Errors', 'count', 0, 'lower_better'],
      ['staff_hours_delivered', 'Staff Hours Delivered', 'hours', 500, 'higher_better'],
      ['client_satisfaction', 'Client Satisfaction Score', '%', 90, 'higher_better'],
      ['safeguarding_referrals', 'Safeguarding Referrals', 'count', 0, 'lower_better'],
    ];
    for (const [key, name, unit, target, direction] of metrics) {
      await client.query(
        `INSERT INTO operational_metric_definitions (company_id, metric_key, display_name, unit, target_value, direction)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [companyId, key, name, unit, target, direction]
      );
    }

    await client.query(
      `INSERT INTO alerts (company_id, severity, title, message, source)
       VALUES
        ($1, 'warning', 'CQC registration renewal due in 45 days', 'Renew registration to avoid a compliance gap.', 'system'),
        ($1, 'info', 'Welcome to CareCompliance Intelligence', 'Your workspace has been set up successfully.', 'system')`,
      [companyId]
    );

    // --- Staff & training matrix ---
    const courseTypes = [
      ['Safeguarding Adults', true, 12],
      ['Moving & Handling', true, 12],
      ['Medication Administration', true, 12],
      ['Fire Safety', true, 12],
      ['Infection Control', true, 12],
      ['First Aid', true, 36],
      ['Food Hygiene', false, 36],
      ['Mental Capacity Act', true, 24],
    ];
    const courseTypeIds = {};
    for (const [name, mandatory, months] of courseTypes) {
      const r = await client.query(
        `INSERT INTO training_course_types (company_id, name, is_mandatory, renewal_period_months)
         VALUES ($1, $2, $3, $4) RETURNING id, name`,
        [companyId, name, mandatory, months]
      );
      courseTypeIds[name] = r.rows[0].id;
    }

    const staffMembers = [
      ['Amara', 'Okafor', 'Senior Care Worker'],
      ['Liam', 'Fitzgerald', 'Care Worker'],
      ['Priya', 'Chandran', 'Registered Manager'],
      ['Tomasz', 'Nowak', 'Care Worker'],
    ];
    const staffIds = [];
    for (const [firstName, lastName, jobTitle] of staffMembers) {
      const r = await client.query(
        `INSERT INTO staff (company_id, first_name, last_name, job_title, start_date, dbs_certificate_no, dbs_issue_date, dbs_expiry_date, dbs_status)
         VALUES ($1, $2, $3, $4, CURRENT_DATE - INTERVAL '2 years', $5, CURRENT_DATE - INTERVAL '2 years', CURRENT_DATE + INTERVAL '30 days', 'clear')
         RETURNING id`,
        [companyId, firstName, lastName, jobTitle, `DBS-${Math.floor(100000 + Math.random() * 900000)}`]
      );
      staffIds.push(r.rows[0].id);
    }

    // A mix of up-to-date, expiring-soon, and never-recorded training so the
    // matrix and alerts have something meaningful to display out of the box.
    await client.query(
      `INSERT INTO staff_training_records (company_id, staff_id, course_type_id, completed_date, expiry_date)
       VALUES
        ($1, $2, $3, CURRENT_DATE - INTERVAL '11 months', CURRENT_DATE + INTERVAL '30 days'),
        ($1, $2, $4, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE + INTERVAL '6 months'),
        ($1, $5, $3, CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '9 months'),
        ($1, $6, $4, CURRENT_DATE - INTERVAL '13 months', CURRENT_DATE - INTERVAL '1 month')`,
      [companyId, staffIds[0], courseTypeIds['Safeguarding Adults'], courseTypeIds['Moving & Handling'], staffIds[1], staffIds[2]]
    );

    // --- CQC readiness ---
    const kloes = ['safe', 'effective', 'caring', 'responsive', 'well_led'];
    for (const kloe of kloes) {
      await client.query(
        `INSERT INTO cqc_evidence_items (company_id, kloe, title, status)
         VALUES ($1, $2, $3, 'not_started')`,
        [companyId, kloe, `${kloe.charAt(0).toUpperCase() + kloe.slice(1).replace('_', '-')}: policy & procedure review`]
      );
    }
    await client.query(
      `INSERT INTO cqc_action_items (company_id, kloe, title, priority, due_date, status)
       VALUES ($1, 'safe', 'Update medication administration policy', 'high', CURRENT_DATE + INTERVAL '14 days', 'open')`,
      [companyId]
    );

    // --- Sample incident ---
    await client.query(
      `INSERT INTO incidents (company_id, incident_type, severity, incident_date, description, client_related, status, reported_by)
       VALUES ($1, 'near_miss', 'low', CURRENT_DATE - INTERVAL '3 days', 'Trip hazard identified and removed in client hallway during routine visit.', true, 'closed', NULL)`,
      [companyId]
    );

    await client.query('COMMIT');
    console.log('✔ Seed completed.');
    console.log('  Customer login:  admin@democare.co.uk / ChangeMe123!  (Registration ID: CCI-DEMO1)');
    console.log('  Platform login:  platform-admin@carecomplianceintelligence.co.uk / PlatformChangeMe123!  (no Registration ID)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✘ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
