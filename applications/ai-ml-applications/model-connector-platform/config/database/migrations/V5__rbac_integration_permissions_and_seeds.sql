-- ==============================================================================
-- Flyway Migration V5: Integration Registry Table & RBAC Role-Permission Seeds
-- Compatible with PostgreSQL 17 and Embedded SQLite
-- ==============================================================================

-- 1. Enterprise Integration Registry Table for Custom & Onboarded Providers
CREATE TABLE IF NOT EXISTS INTEGRATIONS (
    INTEGRATION_ID VARCHAR(64) PRIMARY KEY,
    PROVIDER_NAME VARCHAR(128) NOT NULL,
    PROVIDER_SHORT_CODE VARCHAR(16),
    CATEGORY VARCHAR(64) NOT NULL DEFAULT 'AI Model Providers',
    DESCRIPTION TEXT,
    ICON VARCHAR(16) NOT NULL DEFAULT '🧩',
    BRAND_COLOR VARCHAR(32) NOT NULL DEFAULT '#2563EB',
    ACCOUNT_CATEGORY VARCHAR(32) NOT NULL DEFAULT 'enterprise',
    SUPPORTED_PROTOCOLS VARCHAR(128) NOT NULL DEFAULT 'api,oauth',
    CAPABILITIES_JSON TEXT,
    AUTH_URL VARCHAR(512),
    TOKEN_URL VARCHAR(512),
    API_BASE_URL VARCHAR(512),
    CLI_COMMAND VARCHAR(128),
    DOCS_URL VARCHAR(512),
    LIFECYCLE_STATUS VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    CREATED_BY VARCHAR(64),
    UPDATED_BY VARCHAR(64),
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS IDX_INTEGRATIONS_STATUS ON INTEGRATIONS(LIFECYCLE_STATUS);
CREATE INDEX IF NOT EXISTS IDX_INTEGRATIONS_CATEGORY ON INTEGRATIONS(CATEGORY);

-- 2. Granular Integration Hub CRUD Permissions
INSERT INTO PERMISSIONS (PERMISSION_ID, PERMISSION_CODE, RESOURCE_NAME, ACTION_NAME, DESCRIPTION_TEXT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('perm-integrations-read', 'integrations:read', 'integrations', 'read', 'View Integration Hub catalog and configured provider details', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-create', 'integrations:create', 'integrations', 'create', 'Onboard new external integrations and providers in Integration Hub', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-update', 'integrations:update', 'integrations', 'update', 'Update existing integrations, endpoints, and credential accounts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-delete', 'integrations:delete', 'integrations', 'delete', 'Delete or decommission custom integrations and disconnect accounts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (PERMISSION_ID) DO NOTHING;

-- 3. Seed Canonical Role-Permission Assignments
-- SUPER_ADMIN & role-admin: Full Platform + Integration CRUD Governance
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT r.ROLE_ID, p.PERMISSION_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM ROLES r
JOIN PERMISSIONS p ON r.ROLE_ID IN ('SUPER_ADMIN', 'role-admin')
ON CONFLICT (ROLE_ID, PERMISSION_ID) DO NOTHING;

-- role-mlops: Full Model & Integration CRUD (Create, Read, Update, Delete), no RBAC admin
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT 'role-mlops', p.PERMISSION_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM PERMISSIONS p
WHERE p.PERMISSION_CODE IN (
    'chat:read', 'chat:write',
    'models:read', 'models:manage',
    'sessions:read', 'sessions:manage',
    'telemetry:read', 'onboarding:manage',
    'integrations:read', 'integrations:create', 'integrations:update', 'integrations:delete'
)
ON CONFLICT (ROLE_ID, PERMISSION_ID) DO NOTHING;

-- role-developer: Read, Create & Update Integrations (No Delete, No RBAC Manage)
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT 'role-developer', p.PERMISSION_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM PERMISSIONS p
WHERE p.PERMISSION_CODE IN (
    'chat:read', 'chat:write',
    'models:read',
    'sessions:read', 'sessions:manage',
    'telemetry:read',
    'integrations:read', 'integrations:create', 'integrations:update'
)
ON CONFLICT (ROLE_ID, PERMISSION_ID) DO NOTHING;

-- role-viewer: Strictly Read-Only across Catalog, Telemetry & Integrations
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT 'role-viewer', p.PERMISSION_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM PERMISSIONS p
WHERE p.PERMISSION_CODE IN (
    'chat:read', 'models:read', 'sessions:read', 'telemetry:read', 'integrations:read'
)
ON CONFLICT (ROLE_ID, PERMISSION_ID) DO NOTHING;

