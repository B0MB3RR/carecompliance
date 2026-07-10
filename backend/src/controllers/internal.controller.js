const bcrypt = require('bcrypt');
const { query, pool } = require('../config/db');
const { generateRegistrationId, generateTemporaryPassword } = require('../utils/credentials');
const { recordAudit } = require('../utils/audit');

const PROVIDER_TYPES = ['home_care', 'residential_care', 'supported_living'];

/**
 * Registers a new company on the customer's behalf and issues their first
 * login (a company_admin account with a generated temporary password that
 * must be changed on first sign-in). This is the only way a new company
 * enters the system - there is no public self-service sign-up, by design:
 * CareCompliance Intelligence staff onboard customers directly rather than
 * customers registering themselves.
 *
 * The generated credentials are returned once, in this response only. There
 * is no email delivery wired up yet (same gap as the password-reset flow -
 * see the TODO in auth.controller.js), so the platform admin using this
 * portal is responsible for relaying them to the customer through whatever
 * channel they'd use today (phone, secure email, etc).
 */
async function registerCompany(req, res, next) {
  const { companyName, providerType, cqcRegistrationNo, adminFirstName, adminLastName, adminEmail } = req.body;

  if (!companyName || !providerType || !adminFirstName || !adminLastName || !adminEmail) {
    return res.status(400).json({ error: 'companyName, providerType, adminFirstName, adminLastName and adminEmail are required.' });
  }
  if (!PROVIDER_TYPES.includes(providerType)) {
    return res.status(400).json({ error: 'Invalid provider type.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Registration IDs are generated application-side and enforced unique by
    // the database; retry a handful of times on the near-impossible chance
    // of a collision rather than failing the whole registration outright.
    let company;
    for (let attempt = 0; attempt < 5; attempt++) {
      const registrationId = generateRegistrationId();
      try {
        const companyResult = await client.query(
          `INSERT INTO companies (registration_id, name, provider_type, cqc_registration_no)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [registrationId, companyName, providerType, cqcRegistrationNo || null]
        );
        company = companyResult.rows[0];
        break;
      } catch (err) {
        if (err.code === '23505' && err.constraint?.includes('registration_id')) continue;
        throw err;
      }
    }
    if (!company) {
      throw new Error('Could not generate a unique registration ID after several attempts.');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    let adminUser;
    try {
      const userResult = await client.query(
        `INSERT INTO users (company_id, email, password_hash, first_name, last_name, role, must_change_password)
         VALUES ($1, $2, $3, $4, $5, 'company_admin', true)
         RETURNING id, email, first_name, last_name, role`,
        [company.id, adminEmail.toLowerCase(), passwordHash, adminFirstName, adminLastName]
      );
      adminUser = userResult.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw Object.assign(new Error('That admin email is already registered to a company.'), { status: 409 });
      }
      throw err;
    }

    await client.query(
      `INSERT INTO audit_log (company_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'company_registered_by_platform_admin', 'company', $1, $3)`,
      [company.id, req.user.id, JSON.stringify({ registeredBy: req.user.email })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      company: { id: company.id, registrationId: company.registration_id, name: company.name },
      admin: { email: adminUser.email, firstName: adminUser.first_name, lastName: adminUser.last_name },
      // Shown once - this response is the only place the plaintext password
      // ever exists outside the customer's own head.
      temporaryPassword,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
}

async function listCompanies(req, res, next) {
  try {
    const result = await query(
      `SELECT c.id, c.registration_id, c.name, c.provider_type, c.is_active, c.created_at,
              u.email AS admin_email, u.first_name AS admin_first_name, u.last_name AS admin_last_name
       FROM companies c
       LEFT JOIN LATERAL (
         SELECT email, first_name, last_name FROM users
         WHERE company_id = c.id AND role = 'company_admin'
         ORDER BY created_at ASC LIMIT 1
       ) u ON true
       ORDER BY c.created_at DESC`
    );
    res.json({ companies: result.rows });
  } catch (err) {
    next(err);
  }
}

async function setCompanyActive(req, res, next) {
  const { id } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be a boolean.' });
  }

  try {
    const result = await query(
      `UPDATE companies SET is_active = $1 WHERE id = $2 RETURNING id, name, is_active`,
      [isActive, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found.' });

    await recordAudit({
      companyId: id,
      userId: req.user.id,
      action: isActive ? 'company_reactivated_by_platform_admin' : 'company_suspended_by_platform_admin',
      entityType: 'company',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ company: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerCompany, listCompanies, setCompanyActive };
