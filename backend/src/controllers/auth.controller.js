const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, companyId: user.company_id, role: user.role, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

/**
 * Logs in with email + password, plus a company registration ID for tenant
 * accounts (company_admin/manager/staff). Platform-level super_admin
 * accounts aren't tied to any company, so they log in with just email +
 * password and leave registrationId blank.
 *
 * The registration ID isn't just a UX nicety: users.email is only unique
 * *within* a company (see the schema's UNIQUE(company_id, email)), so two
 * different companies could otherwise have a user sharing the same email
 * address, making a lookup by email alone ambiguous. Scoping by
 * registration ID resolves that.
 */
async function login(req, res, next) {
  const { email, password, registrationId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    let result;
    if (registrationId) {
      result = await query(
        `SELECT u.*, c.name AS company_name, c.registration_id, c.is_active AS company_is_active
         FROM users u
         JOIN companies c ON c.id = u.company_id
         WHERE u.email = $1 AND c.registration_id = $2`,
        [email.toLowerCase(), registrationId.toUpperCase()]
      );
    } else {
      // No registration ID supplied - only matches platform-level accounts,
      // which by the schema's CHECK constraint always have company_id NULL.
      result = await query(
        `SELECT u.*, NULL AS company_name, NULL AS registration_id, true AS company_is_active
         FROM users u
         WHERE u.email = $1 AND u.company_id IS NULL`,
        [email.toLowerCase()]
      );
    }
    const user = result.rows[0];

    if (!user || !user.is_active || user.company_is_active === false) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    if (user.company_id) {
      await recordAudit({ companyId: user.company_id, userId: user.id, action: 'login', ipAddress: req.ip });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await storeRefreshToken(user.id, refreshToken);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id,
        companyName: user.company_name,
        registrationId: user.registration_id,
      },
      mustChangePassword: user.must_change_password,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Sets a new password for the currently authenticated user and clears
 * must_change_password. Used for the forced password change on first login
 * with an admin-issued temporary password.
 */
async function setPassword(req, res, next) {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters long.' });
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2`,
      [passwordHash, req.user.id]
    );
    return res.json({ message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
}

async function storeRefreshToken(userId, refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

async function refresh(req, res, next) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const stored = await query(
      `SELECT * FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [payload.sub, tokenHash]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token is invalid or has been revoked.' });
    }

    const userResult = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [payload.sub]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User no longer active.' });
    }

    const accessToken = signAccessToken(user);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
}

async function logout(req, res, next) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(204).send();

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Requests a password reset. In production, this must email a reset link
 * rather than returning the token directly - it is returned here only to
 * make the MVP testable without an email provider wired up yet.
 */
async function requestPasswordReset(req, res, next) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    const result = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];

    // Always return 200 regardless of whether the user exists, to avoid
    // leaking which email addresses are registered.
    if (!user) return res.json({ message: 'If that account exists, a reset link has been sent.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires_at = $2 WHERE id = $3',
      [tokenHash, expiresAt, user.id]
    );

    // TODO: send `resetToken` via email service instead of returning it.
    return res.json({ message: 'If that account exists, a reset link has been sent.', devResetToken: resetToken });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }
  if (newPassword.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters long.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires_at > now()',
      [tokenHash]
    );
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Reset token is invalid or has expired.' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = $2`,
      [passwordHash, user.id]
    );

    return res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, setPassword, refresh, logout, requestPasswordReset, resetPassword };
