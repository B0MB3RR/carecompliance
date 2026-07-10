const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const auditController = require('../controllers/audit.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', requireRole('company_admin'), auditController.listAuditLog);

module.exports = router;
