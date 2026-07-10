const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

const LOGO_DIR = path.join(process.env.UPLOAD_DIR || './uploads', 'logos');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGO_DIR),
  // One logo per company - overwrite on re-upload rather than accumulating files.
  filename: (req, file, cb) => cb(null, `${req.user.companyId}${path.extname(file.originalname)}`),
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB is plenty for a logo
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_LOGO_TYPES.has(file.mimetype)) return cb(new Error('Logo must be PNG, JPEG, WebP, or SVG.'));
    cb(null, true);
  },
});

async function getCompany(req, res, next) {
  try {
    const result = await query('SELECT * FROM companies WHERE id = $1', [req.user.companyId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found.' });
    res.json({ company: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateCompany(req, res, next) {
  const { name, cqcRegistrationNo, addressLine1, addressLine2, city, postcode, phone } = req.body;
  try {
    const result = await query(
      `UPDATE companies SET
        name = COALESCE($1, name),
        cqc_registration_no = COALESCE($2, cqc_registration_no),
        address_line1 = COALESCE($3, address_line1),
        address_line2 = COALESCE($4, address_line2),
        city = COALESCE($5, city),
        postcode = COALESCE($6, postcode),
        phone = COALESCE($7, phone)
       WHERE id = $8
       RETURNING *`,
      [name, cqcRegistrationNo, addressLine1, addressLine2, city, postcode, phone, req.user.companyId]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'company_settings_updated',
      entityType: 'company',
      entityId: req.user.companyId,
      ipAddress: req.ip,
    });

    res.json({ company: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function saveLogo(req, res, next) {
  if (!req.file) return res.status(400).json({ error: 'No logo file uploaded.' });

  try {
    const result = await query(
      'UPDATE companies SET logo_storage_path = $1 WHERE id = $2 RETURNING id, logo_storage_path',
      [req.file.path, req.user.companyId]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'company_logo_updated',
      entityType: 'company',
      entityId: req.user.companyId,
      ipAddress: req.ip,
    });

    res.status(201).json({ company: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Serves a company's logo file unauthenticated, so it can be used directly
 * as an <img src> without needing to attach a bearer token. A logo carries
 * no sensitive data, so exposing it by company ID (an opaque UUID) is a
 * reasonable and common trade-off - the same pattern most SaaS products
 * use for workspace/team icons.
 */
async function getLogoFile(req, res, next) {
  const { companyId } = req.params;
  try {
    const result = await query('SELECT logo_storage_path FROM companies WHERE id = $1', [companyId]);
    const logoPath = result.rows[0]?.logo_storage_path;
    if (!logoPath || !fs.existsSync(logoPath)) {
      return res.status(404).json({ error: 'No logo set for this company.' });
    }
    res.sendFile(path.resolve(logoPath));
  } catch (err) {
    next(err);
  }
}

module.exports = { getCompany, updateCompany, uploadLogo, saveLogo, getLogoFile };
