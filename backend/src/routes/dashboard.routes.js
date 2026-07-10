const express = require('express');
const { requireAuth } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/summary', dashboardController.getSummary);
router.get('/analytics', dashboardController.getAnalytics);
router.get('/calendar', dashboardController.getUpcomingCalendar);
router.patch('/alerts/:id/read', dashboardController.markAlertRead);

module.exports = router;
