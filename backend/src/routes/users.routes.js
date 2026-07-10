const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const usersController = require('../controllers/users.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', requireRole('company_admin'), usersController.listUsers);
router.post('/', requireRole('company_admin'), usersController.createUser);
router.patch('/:id', requireRole('company_admin'), usersController.updateUser);
router.delete('/:id', requireRole('company_admin'), usersController.deleteUser);

module.exports = router;
