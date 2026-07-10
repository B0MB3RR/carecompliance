-- CareCompliance Intelligence: Multi-tenant PostgreSQL schema
-- Multi-tenancy strategy: shared database, shared schema, tenant isolation via company_id
-- on every tenant-scoped table + application-layer enforcement (see middleware/tenant.js
-- pattern applied in every controller query).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- COMPANIES (tenants)
-- ========================================================================
CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id     VARCHAR(20) NOT NULL UNIQUE, -- customer-facing unique code, required alongside email+password to log in
    name                VARCHAR(255) NOT NULL,
    provider_type       VARCHAR(50) NOT NULL CHECK (provider_type IN ('home_care', 'residential_care', 'supported_living')),
    cqc_registration_no VARCHAR(100),
    address_line1       VARCHAR(255),
    address_line2       VARCHAR(255),
    city                VARCHAR(120),
    postcode            VARCHAR(20),
    phone               VARCHAR(50),
    logo_storage_path   VARCHAR(500),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_registration_id ON companies(registration_id);

-- ========================================================================
-- USERS
-- ========================================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL only for platform-level super_admin accounts (CareCompliance Intelligence staff, not a tenant)
    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    first_name          VARCHAR(120) NOT NULL,
    last_name           VARCHAR(120) NOT NULL,
    role                VARCHAR(50) NOT NULL DEFAULT 'staff'
                            CHECK (role IN ('super_admin', 'company_admin', 'manager', 'staff')),
    must_change_password BOOLEAN NOT NULL DEFAULT false, -- forced on first login for admin-issued credentials
    is_active           BOOLEAN NOT NULL DEFAULT true,
    last_login_at       TIMESTAMPTZ,
    password_reset_token       VARCHAR(255),
    password_reset_expires_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, email),
    CONSTRAINT chk_super_admin_has_no_company
        CHECK ((role = 'super_admin' AND company_id IS NULL) OR (role != 'super_admin' AND company_id IS NOT NULL))
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);

-- The table-level UNIQUE(company_id, email) above doesn't catch duplicate
-- emails across platform-admin rows, since Postgres treats every NULL as
-- distinct. This partial index closes that gap for company_id IS NULL rows.
CREATE UNIQUE INDEX idx_users_platform_admin_email ON users(email) WHERE company_id IS NULL;

-- ========================================================================
-- REFRESH TOKENS (for JWT rotation / logout support)
-- ========================================================================
CREATE TABLE refresh_tokens (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ========================================================================
-- DOCUMENTS (Document Management module)
-- ========================================================================
CREATE TABLE document_categories (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    description         VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

CREATE TABLE documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id         UUID REFERENCES document_categories(id) ON DELETE SET NULL,
    uploaded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name           VARCHAR(255) NOT NULL,
    original_name       VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(150),
    size_bytes          BIGINT,
    storage_path        VARCHAR(500) NOT NULL,
    description         VARCHAR(500),
    expiry_date         DATE,
    tags                TEXT[],
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_company_id ON documents(company_id);
CREATE INDEX idx_documents_category_id ON documents(category_id);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);

-- ========================================================================
-- OPERATIONAL DATA MODULE
-- ========================================================================
-- Configurable metric definitions per company (e.g. incidents, staff hours,
-- occupancy, medication errors, safeguarding referrals, complaints)
CREATE TABLE operational_metric_definitions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    metric_key          VARCHAR(100) NOT NULL,
    display_name        VARCHAR(150) NOT NULL,
    unit                VARCHAR(50),
    target_value        NUMERIC,
    direction           VARCHAR(20) NOT NULL DEFAULT 'lower_better'
                            CHECK (direction IN ('lower_better', 'higher_better')),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, metric_key)
);

CREATE TABLE operational_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    metric_definition_id UUID NOT NULL REFERENCES operational_metric_definitions(id) ON DELETE CASCADE,
    recorded_value      NUMERIC NOT NULL,
    record_date         DATE NOT NULL,
    notes               VARCHAR(1000),
    recorded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_op_records_company_date ON operational_records(company_id, record_date);
CREATE INDEX idx_op_records_metric ON operational_records(metric_definition_id);

-- ========================================================================
-- ALERTS / NOTIFICATIONS (Dashboard module)
-- ========================================================================
CREATE TABLE alerts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    severity            VARCHAR(20) NOT NULL DEFAULT 'info'
                            CHECK (severity IN ('info', 'warning', 'critical')),
    title               VARCHAR(255) NOT NULL,
    message             VARCHAR(1000),
    source              VARCHAR(100),
    is_read             BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_company_id ON alerts(company_id);

-- ========================================================================
-- REPORTS (Reporting module)
-- ========================================================================
CREATE TABLE reports (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    generated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    report_type         VARCHAR(100) NOT NULL,
    parameters          JSONB,
    file_path           VARCHAR(500),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'completed', 'failed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_company_id ON reports(company_id);

-- ========================================================================
-- AUDIT TRAIL (Administration module)
-- ========================================================================
CREATE TABLE audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    action              VARCHAR(100) NOT NULL,
    entity_type         VARCHAR(100),
    entity_id           UUID,
    metadata            JSONB,
    ip_address          VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_company_id ON audit_log(company_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ========================================================================
-- STAFF & TRAINING / COMPETENCY MATRIX
-- ========================================================================
-- `staff` is deliberately separate from `users`: every care worker on the
-- rota needs a training/DBS record, but not every one needs a system login.
-- `linked_user_id` connects a staff record to a login account when the
-- person also uses the platform (e.g. a manager who is also on the rota).
CREATE TABLE staff (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    linked_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    first_name          VARCHAR(120) NOT NULL,
    last_name           VARCHAR(120) NOT NULL,
    job_title           VARCHAR(150),
    employment_status   VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (employment_status IN ('active', 'on_leave', 'left')),
    start_date          DATE,
    end_date            DATE,
    dbs_certificate_no  VARCHAR(100),
    dbs_issue_date      DATE,
    dbs_expiry_date     DATE,
    dbs_status          VARCHAR(20) NOT NULL DEFAULT 'not_started'
                            CHECK (dbs_status IN ('clear', 'pending', 'not_started', 'flagged')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_company_id ON staff(company_id);

-- Configurable list of mandatory/optional training courses per company
-- (Safeguarding, Moving & Handling, Medication, Fire Safety, etc.)
CREATE TABLE training_course_types (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    is_mandatory        BOOLEAN NOT NULL DEFAULT true,
    renewal_period_months INTEGER, -- NULL = does not expire
    is_active           BOOLEAN NOT NULL DEFAULT true, -- "removed" courses are deactivated, not deleted, to preserve historical training records
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

-- One row per staff member per completed training instance. Expiry is
-- stored explicitly (rather than derived every read) so a course type's
-- renewal period can change without silently rewriting history.
CREATE TABLE staff_training_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    staff_id            UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    course_type_id      UUID NOT NULL REFERENCES training_course_types(id) ON DELETE CASCADE,
    completed_date      DATE NOT NULL,
    expiry_date         DATE,
    certificate_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    notes               VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_records_company ON staff_training_records(company_id);
CREATE INDEX idx_training_records_staff ON staff_training_records(staff_id);
CREATE INDEX idx_training_records_expiry ON staff_training_records(expiry_date);

CREATE TABLE supervision_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    staff_id            UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    supervision_date    DATE NOT NULL,
    next_due_date       DATE,
    conducted_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    notes               VARCHAR(1000),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supervision_company ON supervision_records(company_id);
CREATE INDEX idx_supervision_staff ON supervision_records(staff_id);

-- ========================================================================
-- CQC INSPECTION READINESS
-- ========================================================================
-- Evidence library organised by the five CQC Key Lines of Enquiry (KLOEs).
CREATE TABLE cqc_evidence_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kloe                VARCHAR(20) NOT NULL
                            CHECK (kloe IN ('safe', 'effective', 'caring', 'responsive', 'well_led')),
    title               VARCHAR(255) NOT NULL,
    description          VARCHAR(1000),
    document_id         UUID REFERENCES documents(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'not_started'
                            CHECK (status IN ('not_started', 'in_progress', 'ready')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cqc_evidence_company ON cqc_evidence_items(company_id);

-- Action plan / CAPA tracker, usable both for self-identified gaps and for
-- items raised out of an actual inspection report.
CREATE TABLE cqc_action_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kloe                VARCHAR(20) NOT NULL
                            CHECK (kloe IN ('safe', 'effective', 'caring', 'responsive', 'well_led')),
    title               VARCHAR(255) NOT NULL,
    description         VARCHAR(1000),
    owner_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    priority            VARCHAR(10) NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('low', 'medium', 'high')),
    due_date            DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'completed')),
    completed_date      DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cqc_action_company ON cqc_action_items(company_id);

-- ========================================================================
-- INCIDENTS & SAFEGUARDING REGISTER
-- ========================================================================
CREATE TABLE incidents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    incident_type       VARCHAR(30) NOT NULL
                            CHECK (incident_type IN ('accident', 'safeguarding_concern', 'medication_error', 'complaint', 'near_miss', 'other')),
    severity            VARCHAR(10) NOT NULL DEFAULT 'low'
                            CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    incident_date       DATE NOT NULL,
    description         VARCHAR(2000) NOT NULL,
    client_related      BOOLEAN NOT NULL DEFAULT true,
    staff_involved      VARCHAR(500),
    actions_taken       VARCHAR(2000),
    notifiable_to_cqc   BOOLEAN NOT NULL DEFAULT false,
    status              VARCHAR(20) NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'under_review', 'closed')),
    reported_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_date         DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_company ON incidents(company_id);
CREATE INDEX idx_incidents_status ON incidents(status);

-- ========================================================================
-- POLICY ACKNOWLEDGEMENTS
-- ========================================================================
-- Lightweight sign-off tracking: which staff have confirmed they've read a
-- given policy document (from the Documents module).
CREATE TABLE policy_acknowledgements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    staff_id            UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    acknowledged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, staff_id)
);

CREATE INDEX idx_policy_ack_company ON policy_acknowledgements(company_id);

-- ========================================================================
-- Trigger: keep updated_at fresh
-- ========================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cqc_evidence_updated_at BEFORE UPDATE ON cqc_evidence_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cqc_action_updated_at BEFORE UPDATE ON cqc_action_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
