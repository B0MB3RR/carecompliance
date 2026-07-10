require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const companyRoutes = require('./routes/company.routes');
const documentsRoutes = require('./routes/documents.routes');
const operationalRoutes = require('./routes/operational.routes');
const reportsRoutes = require('./routes/reports.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const auditRoutes = require('./routes/audit.routes');
const staffRoutes = require('./routes/staff.routes');
const cqcRoutes = require('./routes/cqc.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

// crossOriginResourcePolicy defaults to "same-origin" under Helmet, which
// silently blocks <img> loads from a different origin - the frontend
// (e.g. localhost:3000) and this API (e.g. localhost:4000) are different
// origins by browser rules even on the same machine, so the default was
// breaking the company logo <img src> that points at the branding
// endpoint. "cross-origin" is safe here: the only unauthenticated GET this
// policy affects is the logo route, which is intentionally public.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// General API rate limit (auth routes have their own tighter limit).
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false })
);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public (unauthenticated) logo route - see getLogoFile's docstring for why
// this is safe to expose without a bearer token.
const companyController = require('./controllers/company.controller');
app.get('/api/branding/:companyId/logo', companyController.getLogoFile);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/operational', operationalRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/cqc', cqcRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/internal', internalRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CareCompliance API listening on port ${PORT}`);
});

module.exports = app;
