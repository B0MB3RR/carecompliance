const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cqcController = require('../controllers/cqc.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/evidence', cqcController.listEvidence);
router.post('/evidence', cqcController.createEvidence);
router.patch('/evidence/:id', cqcController.updateEvidence);

router.get('/actions', cqcController.listActionItems);
router.post('/actions', cqcController.createActionItem);
router.patch('/actions/:id', cqcController.updateActionItem);

router.get('/readiness-score', cqcController.getReadinessScore);

module.exports = router;
