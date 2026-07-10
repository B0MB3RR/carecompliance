const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const companyController = require('../controllers/company.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', companyController.getCompany);
router.patch('/', requireRole('company_admin'), companyController.updateCompany);
router.post('/logo', requireRole('company_admin'), companyController.uploadLogo.single('logo'), companyController.saveLogo);

module.exports = router;
