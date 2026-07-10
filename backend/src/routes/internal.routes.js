const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const internalController = require('../controllers/internal.controller');

const router = express.Router();

// Every route here is platform-staff only - no tenant company_id applies,
// since these endpoints manage companies themselves rather than data
// within one.
router.use(requireAuth, requireRole('super_admin'));

router.post('/companies', internalController.registerCompany);
router.get('/companies', internalController.listCompanies);
router.patch('/companies/:id/active', internalController.setCompanyActive);

module.exports = router;
