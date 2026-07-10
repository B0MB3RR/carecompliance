const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]);

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported file type.'));
    }
    cb(null, true);
  },
});

async function listCategories(req, res, next) {
  try {
    const result = await query(
      'SELECT * FROM document_categories WHERE company_id = $1 ORDER BY name',
      [req.user.companyId]
    );
    res.json({ categories: result.rows });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  try {
    const result = await query(
      `INSERT INTO document_categories (company_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.companyId, name, description || null]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category already exists.' });
    next(err);
  }
}

async function uploadDocument(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { categoryId, description, expiryDate, tags } = req.body;
  const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  try {
    const result = await query(
      `INSERT INTO documents
        (company_id, category_id, uploaded_by, file_name, original_name, mime_type, size_bytes, storage_path, description, expiry_date, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.user.companyId,
        categoryId || null,
        req.user.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.path,
        description || null,
        expiryDate || null,
        tagList,
      ]
    );

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'document_uploaded',
      entityType: 'document',
      entityId: result.rows[0].id,
      metadata: { originalName: req.file.originalname },
      ipAddress: req.ip,
    });

    res.status(201).json({ document: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function listDocuments(req, res, next) {
  const { search, categoryId } = req.query;
  const conditions = ['company_id = $1'];
  const params = [req.user.companyId];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(original_name ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`category_id = $${params.length}`);
  }

  try {
    const result = await query(
      `SELECT id, category_id, original_name, mime_type, size_bytes, description, expiry_date, tags, created_at
       FROM documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ documents: result.rows });
  } catch (err) {
    next(err);
  }
}

async function downloadDocument(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
      [id, req.user.companyId]
    );
    const doc = result.rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    res.download(doc.storage_path, doc.original_name);
  } catch (err) {
    next(err);
  }
}

async function deleteDocument(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      'DELETE FROM documents WHERE id = $1 AND company_id = $2 RETURNING storage_path',
      [id, req.user.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found.' });

    const filePath = result.rows[0].storage_path;
    fs.unlink(filePath, () => {}); // best-effort cleanup

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'document_deleted',
      entityType: 'document',
      entityId: id,
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function acknowledgeDocument(req, res, next) {
  const { id } = req.params;
  const { staffId } = req.body;
  if (!staffId) return res.status(400).json({ error: 'staffId is required.' });

  try {
    const result = await query(
      `INSERT INTO policy_acknowledgements (company_id, document_id, staff_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id, staff_id) DO UPDATE SET acknowledged_at = now()
       RETURNING *`,
      [req.user.companyId, id, staffId]
    );
    res.status(201).json({ acknowledgement: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function listAcknowledgements(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT pa.*, s.first_name, s.last_name
       FROM policy_acknowledgements pa
       JOIN staff s ON s.id = pa.staff_id
       WHERE pa.document_id = $1 AND pa.company_id = $2
       ORDER BY pa.acknowledged_at DESC`,
      [id, req.user.companyId]
    );
    res.json({ acknowledgements: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  upload,
  listCategories,
  createCategory,
  uploadDocument,
  listDocuments,
  downloadDocument,
  deleteDocument,
  acknowledgeDocument,
  listAcknowledgements,
};
