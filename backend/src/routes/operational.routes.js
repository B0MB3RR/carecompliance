const express = require('express');
const { requireAuth } = require('../middleware/auth');
const operationalController = require('../controllers/operational.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/metrics', operationalController.listMetricDefinitions);
router.post('/metrics', operationalController.createMetricDefinition);

router.get('/records', operationalController.listRecords);
router.post('/records', operationalController.createRecord);

module.exports = router;
