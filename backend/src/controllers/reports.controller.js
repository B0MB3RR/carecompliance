const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');

const REPORTS_DIR = path.join(process.env.UPLOAD_DIR || './uploads', 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

/**
 * Generates a compliance/operational summary PDF report for a given date
 * range and stores it on disk, recording metadata in the `reports` table.
 */
async function generateReport(req, res, next) {
  const { reportType, from, to } = req.body;
  if (!reportType || !from || !to) {
    return res.status(400).json({ error: 'reportType, from and to dates are required.' });
  }

  try {
    const companyResult = await query('SELECT * FROM companies WHERE id = $1', [req.user.companyId]);
    const company = companyResult.rows[0];

    const metricsResult = await query(
      `SELECT m.display_name, m.unit, r.recorded_value, r.record_date
       FROM operational_records r
       JOIN operational_metric_definitions m ON m.id = r.metric_definition_id
       WHERE r.company_id = $1 AND r.record_date BETWEEN $2 AND $3
       ORDER BY m.display_name, r.record_date`,
      [req.user.companyId, from, to]
    );

    const reportInsert = await query(
      `INSERT INTO reports (company_id, generated_by, report_type, parameters, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [req.user.companyId, req.user.id, reportType, JSON.stringify({ from, to })]
    );
    const reportId = reportInsert.rows[0].id;
    const fileName = `${reportId}.pdf`;
    const filePath = path.join(REPORTS_DIR, fileName);

    await buildPdf(filePath, { company, reportType, from, to, rows: metricsResult.rows });

    await query(`UPDATE reports SET file_path = $1, status = 'completed' WHERE id = $2`, [filePath, reportId]);

    await recordAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'report_generated',
      entityType: 'report',
      entityId: reportId,
      metadata: { reportType, from, to },
      ipAddress: req.ip,
    });

    res.status(201).json({ reportId, downloadUrl: `/api/reports/${reportId}/download` });
  } catch (err) {
    next(err);
  }
}

function buildPdf(filePath, { company, reportType, from, to, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Place the company logo top-right if one has been uploaded, so
    // reports look branded rather than generic when shared with inspectors
    // or head office.
    if (company.logo_storage_path && fs.existsSync(company.logo_storage_path)) {
      try {
        doc.image(company.logo_storage_path, 430, 45, { fit: [115, 60], align: 'right' });
      } catch {
        // Corrupt/unsupported image format - fall back to text-only header.
      }
    }

    doc.fontSize(20).text('CareCompliance Intelligence', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(14).fillColor('#555').text(`${reportType} report`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#000')
      .text(`Provider: ${company.name}`)
      .text(`Period: ${from} to ${to}`)
      .text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown();

    if (rows.length === 0) {
      doc.fontSize(11).text('No operational records were found for the selected period.');
    } else {
      doc.fontSize(12).text('Operational Metrics', { underline: true });
      doc.moveDown(0.5);

      rows.forEach((row) => {
        const value = `${row.recorded_value}${row.unit ? ' ' + row.unit : ''}`;
        const date = new Date(row.record_date).toISOString().split('T')[0];
        doc.fontSize(10).text(`${date}  —  ${row.display_name}: ${value}`);
      });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function listReports(req, res, next) {
  try {
    const result = await query(
      `SELECT id, report_type, parameters, status, created_at FROM reports
       WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.user.companyId]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    next(err);
  }
}

async function downloadReport(req, res, next) {
  const { id } = req.params;
  try {
    const result = await query(
      'SELECT * FROM reports WHERE id = $1 AND company_id = $2',
      [id, req.user.companyId]
    );
    const report = result.rows[0];
    if (!report || report.status !== 'completed' || !report.file_path) {
      return res.status(404).json({ error: 'Report not found or not yet ready.' });
    }
    res.download(report.file_path, `${report.report_type}-report.pdf`);
  } catch (err) {
    next(err);
  }
}

module.exports = { generateReport, listReports, downloadReport };
