# CareCompliance Intelligence — MVP Scaffold

A cloud-based compliance management platform for UK regulated care providers
(home care, residential care, and supported living). This scaffold implements
the MVP feature set from the project brief — authentication, dashboard,
document management, operational data tracking, PDF reporting, and admin
tools — plus a second pass of manager-focused tooling: a staff training
matrix, CQC inspection readiness tracking, and an incidents/safeguarding
register.

There is no public self-service sign-up. Every company on the platform is
registered by CareCompliance Intelligence staff (a `super_admin` role) through
an internal onboarding portal, which issues the customer a unique company
**registration ID** and a temporary password. Customers log in with their
email, password, and that registration ID — see "Authentication model" below
for why the registration ID exists and how it resolves an ambiguity that a
plain email+password login can't.

## Stack

- **Frontend:** Next.js 14 (App Router), React 18, Recharts — builds as a static export (`output: 'export'`), responsive from phone to desktop, deployable to Netlify. Dark theme by default app-wide (not just the dashboard), with a light mode toggle in the sidebar; preference persists per-browser via `localStorage`.
- **Backend:** Node.js, Express
- **Database:** PostgreSQL (multi-tenant: every table is scoped by `company_id`)
- **Auth:** JWT access + refresh tokens, bcrypt password hashing, role-based access control

## Modules

| Module | What it does |
|---|---|
| **Dashboard** | Grafana-style panel layout. KPI stat panels, the "Compliance Pulse" strip, a stacked bar chart of incidents by severity (last 6 months), a radar chart of CQC readiness by KLOE, a horizontal bar chart of training compliance by mandatory course, a computed "Needs attention" panel (expiring DBS checks, lapsing training, overdue supervisions, overdue CQC actions), and an alert feed. |
| **Compliance Calendar** | Every upcoming deadline across the whole app in one chronological list — DBS renewals, training expiries, supervision due dates, CQC action deadlines, and document expiries — grouped by month, with an adjustable look-ahead window (30 days to 12 months). |
| **Branding** | Upload a company logo (PNG/JPEG/WebP/SVG) once in Admin → Company Settings — it then appears in the sidebar and is embedded on generated PDF reports automatically. |
| **Staff & Training** | A staff register (with DBS certificate tracking) and a training/competency matrix — every active staff member × every mandatory course, with completion and expiry dates. Company admins and managers can edit a staff member's role, DBS status/expiry, and employment status inline, and can add or remove courses from the matrix to match their own training requirements (removing a course deactivates it rather than deleting history, so past completions stay on record for audit purposes). Includes a transparent per-person training compliance scorecard and a CSV export of the full matrix for offline CQC evidence packs. Also tracks 1:1 supervision sessions and their next-due dates. |
| **Incidents & Safeguarding** | A structured incident log (accidents, safeguarding concerns, medication errors, complaints, near-misses) with severity, CQC-notifiable flagging, and a status workflow (open → under review → closed). High/critical incidents auto-raise a dashboard alert. |
| **CQC Readiness** | An evidence library organised by the five CQC Key Lines of Enquiry (Safe, Effective, Caring, Responsive, Well-led), an action plan / CAPA tracker, and a transparent readiness score per KLOE (not a black-box number — it's the share of evidence marked "ready," penalised for open/overdue actions). |
| **Documents** | Upload, categorise, search, and download compliance records; policy documents can now track staff sign-off/acknowledgement. |
| **Operational Data** | Configurable metrics (incidents, medication errors, staff hours, etc.) with a data entry form and trend charts. |
| **Reports** | Generates and downloads PDF summaries for a given date range. |
| **Administration** | User management, company/CQC registration details, and a full audit trail. |
| **Company Onboarding** (platform staff only) | The internal portal `super_admin` accounts use to register new customer companies — generates a unique registration ID and a temporary admin password, shown once. Also lists every company on the platform with a suspend/reactivate toggle. Invisible to ordinary tenant users; a customer's own dashboard, staff records, etc. never appear here. |

## Authentication model

There's no public "sign up" form. Two account types exist:

- **Tenant accounts** (`company_admin`, `manager`, `staff`) belong to exactly one company and log in with **email + password + company registration ID**. The registration ID isn't just UX flavour: `users.email` is only unique *within* a company (`UNIQUE(company_id, email)`), so two different companies could otherwise end up with a user sharing the same email address, making a plain email+password login ambiguous. Scoping the lookup by registration ID resolves that, and also means two companies with the identical name never collide — the registration ID, not the name, is what's unique.
- **Platform accounts** (`super_admin`) belong to CareCompliance Intelligence itself, not a customer, so they have no company and log in with just email + password (leave the registration ID field blank — there's a checkbox for this on the login screen).

New tenant accounts are always created by a `super_admin` through **Company Onboarding**, which issues a temporary password. That account is forced through a **Set your password** screen on first login (`must_change_password` in the schema) before it can reach anything else — this is enforced both by the frontend's route guard and by every protected API route requiring a valid session regardless, so it's not just a UI nicety.

To create your own `super_admin` account for local testing, either use the one `npm run seed` creates (see below) or insert one directly:
```sql
-- from psql, after hashing a password with bcrypt (12 rounds) in Node:
-- require('bcrypt').hashSync('YourPassword123!', 12)
INSERT INTO users (company_id, email, password_hash, first_name, last_name, role)
VALUES (NULL, 'you@example.com', '<bcrypt hash>', 'Your', 'Name', 'super_admin');
```

## Project structure

```
carecompliance/
├── backend/
│   ├── src/
│   │   ├── config/db.js           # PostgreSQL connection pool
│   │   ├── controllers/           # Business logic per module
│   │   │   ├── staff.controller.js       # Staff, training matrix, supervisions
│   │   │   ├── cqc.controller.js         # KLOE evidence, action plan, readiness score
│   │   │   ├── incidents.controller.js   # Incidents & safeguarding register
│   │   │   └── ...
│   │   ├── db/schema.sql          # Full multi-tenant schema
│   │   ├── db/migrate.js          # Runs schema.sql
│   │   ├── db/seed.js             # Demo company, staff, training records, CQC evidence
│   │   ├── middleware/auth.js     # JWT verification + role guard
│   │   ├── routes/                # Express route definitions
│   │   ├── utils/audit.js         # Audit trail helper
│   │   └── server.js              # App entrypoint
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── login/                 # Email + password + registration ID (or platform-staff toggle)
│   │   ├── register/              # Informational only - directs visitors to contact CareCompliance Intelligence
│   │   ├── set-password/          # Forced password change on first login with admin-issued credentials
│   │   ├── internal-onboarding/   # super_admin only: register companies, generate registration IDs
│   │   ├── dashboard/             # KPI cards + "Compliance Pulse" + compliance alerts
│   │   ├── calendar/              # Compliance Calendar - every upcoming deadline in one list
│   │   ├── staff/                 # Training matrix + DBS tracking + supervisions
│   │   ├── incidents/             # Incident & safeguarding log
│   │   ├── cqc-readiness/         # KLOE evidence library + action plan + readiness score
│   │   ├── documents/             # Upload, categorise, search, download
│   │   ├── operational-data/      # Data entry + trend charts
│   │   ├── reports/               # Generate + download PDF reports
│   │   └── admin/                 # Users, company settings, audit trail
│   ├── components/AppShell.js     # Sidebar navigation shell (role-aware: tenant nav vs platform-staff nav)
│   ├── lib/api.js                 # Fetch wrapper with token refresh
│   ├── lib/auth-context.js        # Auth state (React context)
│   └── lib/theme-context.js       # Light/dark theme, persisted per-browser
└── docker-compose.yml             # Local PostgreSQL for development
```

## Getting started

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # edit JWT secrets before anything real touches this
npm install
npm run migrate           # creates all tables
npm run seed               # demo company, staff, training matrix, CQC evidence, sample incident
npm run dev                # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

Visit `http://localhost:3000` and sign in. `npm run seed` creates two accounts to try:

- **Customer login** — `admin@democare.co.uk` / `ChangeMe123!`, registration ID `CCI-DEMO1`. Lands on the tenant dashboard with demo staff, training records, CQC evidence, and a sample incident already loaded.
- **Platform login** — `platform-admin@carecomplianceintelligence.co.uk` / `PlatformChangeMe123!`, no registration ID (tick "I'm CareCompliance Intelligence platform staff" on the login screen instead). Lands on **Company Onboarding**, where you can register further test companies and see their generated registration IDs and temporary passwords.

## Deployment

The frontend and backend deploy to different places, because they need different things: the frontend is a static Next.js export (plain HTML/JS/CSS, perfect for Netlify), while the backend is a long-running Express server holding a PostgreSQL connection pool and writing files to disk (uploads, generated PDF reports) - Netlify's serverless functions aren't built for that. Render pairs naturally with Netlify for this.

### 1. Backend + database → Render

1. Push this repo to GitHub.
2. Go to [render.com/deploy](https://render.com/deploy) and point it at your repo — it reads `render.yaml` at the root automatically and provisions both the web service and a managed PostgreSQL database.
3. Once it's live, open the service's **Shell** tab in the Render dashboard and run the same two commands you'd run locally:
   ```bash
   npm run migrate
   npm run seed   # optional - demo data
   ```
4. Note the backend's public URL (e.g. `https://carecompliance-backend.onrender.com`) — you'll need it for the frontend.

### 2. Frontend → Netlify

1. In Netlify, "Add new site" → "Import an existing project" → point it at the same repo. It reads `netlify.toml` at the root, which tells it to build from the `frontend/` subfolder.
2. **Before the first build**, go to Site settings → Environment variables and add:
   ```
   NEXT_PUBLIC_API_URL = https://carecompliance-backend.onrender.com/api
   ```
   This has to be set before you build, not after — it's baked into the static files at build time, so changing it later means triggering a fresh deploy, not just a redeploy of the same build.
3. Trigger a deploy. Netlify will run `npm run build` inside `frontend/` and publish the static `out/` folder.

### 3. Connect the two

Go back to Render and update the backend's `FRONTEND_URL` environment variable to your actual Netlify URL (e.g. `https://your-site-name.netlify.app`) — this is what the backend's CORS policy checks against, so login/API calls will be blocked until it matches.

### Honest limitations of this setup

- **File storage is ephemeral on Render's free tier.** Uploaded documents and generated PDF reports are written to local disk, which doesn't persist across redeploys or restarts. Fine for a demo/pilot; for real use, swap `documents.controller.js`'s storage engine for S3-compatible storage (this was already flagged as a to-do below, and matters more once you're actually deploying).
- **Render's free tier spins down after inactivity** and takes ~30-60 seconds to wake on the next request — the first login after a quiet period will feel slow. Upgrading to a paid instance removes this.
- **Static export means no server-side rendering.** Every page ships as pre-built HTML that hydrates into a client-rendered app on load — fine for an internal dashboard tool like this, but worth knowing if you were expecting SSR/ISR behavior.

## Security notes for going further

- Replace the JWT secrets in `.env` with long random values before any real
  deployment — never commit real secrets to source control.
- The `migrate.js` script is a minimal bootstrapper; move to a versioned
  migration tool (e.g. `node-pg-migrate`) once the schema starts changing
  after go-live, so you can track and roll back changes safely.
- File uploads are currently stored on local disk (`UPLOAD_DIR`) — swap
  `documents.controller.js`'s storage engine for an S3/Azure Blob adapter
  before deploying to the cloud, since local disk won't persist or scale
  across instances.
- Add automated tests (Jest + Supertest for the API, Playwright/Cypress for
  the frontend) before this goes further into MVP hardening.
- CQC/regulatory documentation retention rules should inform how long
  documents and audit log entries are kept — this scaffold does not enforce
  a retention policy yet.

## What's intentionally left for the next pass

- Rota/staffing ratio compliance (checking shift coverage against required staff:client ratios)
- Client/service-user records module (care plans, risk assessments) — this scaffold tracks staff and organisational compliance, not individual care records, which would need its own data protection review given the sensitivity of client health data
- Email delivery for password resets, compliance alerts, and newly-onboarded company credentials (all currently surfaced in-app only — the Company Onboarding portal shows the temporary password once on-screen for the platform admin to relay manually; see the `TODO` in `auth.controller.js` and the note in `internal.controller.js`)
- Metric configuration UI (operational metrics are seeded/created via API only)
- Pagination on documents/audit/incidents tables (fine for MVP data volumes, but will need it)
- Automated tests and CI pipeline
- Production deployment configs (the brief calls for AWS/Azure — this scaffold is cloud-agnostic and deploys to either)
