const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const staffController = require('../controllers/staff.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', staffController.listStaff);
router.post('/', requireRole('company_admin', 'manager'), staffController.createStaff);
router.patch('/:id', requireRole('company_admin', 'manager'), staffController.updateStaff);

router.get('/course-types', staffController.listCourseTypes);
router.post('/course-types', requireRole('company_admin', 'manager'), staffController.createCourseType);
router.delete('/course-types/:id', requireRole('company_admin', 'manager'), staffController.deactivateCourseType);

router.get('/training-matrix', staffController.getTrainingMatrix);
router.post('/training-records', requireRole('company_admin', 'manager'), staffController.createTrainingRecord);

router.get('/supervisions', staffController.listSupervisions);
router.post('/supervisions', requireRole('company_admin', 'manager'), staffController.createSupervision);

module.exports = router;
