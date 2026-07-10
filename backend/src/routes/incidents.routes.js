const express = require('express');
const { requireAuth } = require('../middleware/auth');
const incidentsController = require('../controllers/incidents.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', incidentsController.listIncidents);
router.post('/', incidentsController.createIncident);
router.patch('/:id', incidentsController.updateIncident);

module.exports = router;
