const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Tighter rate limit on auth endpoints to slow down credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// No public self-registration endpoint by design - new companies are
// onboarded by CareCompliance Intelligence staff via /api/internal/companies
// (see internal.routes.js), which is itself gated to the super_admin role.
router.post('/login', authLimiter, authController.login);
router.post('/set-password', requireAuth, authController.setPassword);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/request-password-reset', authLimiter, authController.requestPasswordReset);
router.post('/reset-password', authLimiter, authController.resetPassword);

module.exports = router;
