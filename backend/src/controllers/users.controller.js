const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

// All queries are scoped by req.user.companyId - this is the tenant
// isolation boundary. Never accept a company_id from the request body.

async function listUsers(req, res, next) {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
       FROM users WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.user.companyId]
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  const { email, password, firstName, lastName, role } = req.body;
  const allowedRoles = ['company_admin', 'manager', 'staff'];

  if (!email || !password || !firstName || !lastName || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, role, is_active, created_at`,
      [req.user.companyId, email.toLowerCase(), passwordHash, firstName, lastName, role]
    );
    const user = result.rows[0];

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'user_created',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists in this company.' });
    }
    next(err);
  }
}

async function updateUser(req, res, next) {
  const { id } = req.params;
  const { firstName, lastName, role, isActive } = req.body;

  try {
    const result = await query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        role = COALESCE($3, role),
        is_active = COALESCE($4, is_active)
       WHERE id = $5 AND company_id = $6
       RETURNING id, email, first_name, last_name, role, is_active`,
      [firstName, lastName, role, isActive, id, req.user.companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'user_updated',
      entityType: 'user',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE users SET is_active = false WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, req.user.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'user_deactivated',
      entityType: 'user',
      entityId: id,
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
