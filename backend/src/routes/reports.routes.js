const express = require('express');
const { requireAuth } = require('../middleware/auth');
const reportsController = require('../controllers/reports.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', reportsController.listReports);
router.post('/', reportsController.generateReport);
router.get('/:id/download', reportsController.downloadReport);

module.exports = router;
