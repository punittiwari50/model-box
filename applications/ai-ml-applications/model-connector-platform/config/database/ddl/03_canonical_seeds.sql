-- ==============================================================================
-- ModelConnector Platform Enterprise DML Seed Script (Canonical Categories & RBAC)
-- Automatically executed on PostgreSQL container initialization
-- ==============================================================================

-- 1. MODEL CATEGORIES
INSERT INTO MODEL_CATEGORIES (CATEGORY_ID, LABEL, ICON, ACCENT_COLOR, DESCRIPTION, SORT_ORDER, CREATED_TIMESTAMP)
VALUES 
    ('google', 'Google Gemini', '✨', '#4285F4', 'Google DeepMind Gemini 3.8 & 3.5 multimodal reasoning models', 1, CURRENT_TIMESTAMP),
    ('anthropic', 'Anthropic Claude', '🎭', '#D97757', 'Anthropic Claude 3.7 & 3.5 Sonnet / Haiku models', 2, CURRENT_TIMESTAMP),
    ('microsoft', 'GitHub Copilot', '🐙', '#6E40C9', 'GitHub Copilot & Microsoft enterprise coding models', 3, CURRENT_TIMESTAMP),
    ('openai', 'OpenAI GPT', '🧠', '#10A37F', 'OpenAI GPT-4o, o3-mini, and Codex models', 4, CURRENT_TIMESTAMP),
    ('xai', 'xAI Grok', '🚀', '#1DA1F2', 'xAI Grok-3 and Grok-2 real-time reasoning models', 5, CURRENT_TIMESTAMP),
    ('ollama', 'Local Ollama', '🦙', '#F59E0B', 'Local open-weights models (lfm3-omni, LLaMA 3.2, Qwen, Phi-4, Gemma)', 6, CURRENT_TIMESTAMP)
ON CONFLICT (CATEGORY_ID) DO NOTHING;

-- 2. COMPANIES
INSERT INTO COMPANIES (COMPANY_ID, COMPANY_NAME, COMPANY_DOMAIN, SUBSCRIPTION_TIER, IS_ACTIVE, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('comp-platform', 'Model Connector Platform', 'model-connector.local', 'ENTERPRISE', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('acme-corp', 'Acme Global Industries', 'acme.corp', 'ENTERPRISE', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('research-lab', 'Deep Intelligence Research Labs', 'research.ai', 'ENTERPRISE', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (COMPANY_ID) DO NOTHING;

-- 3. ROLES
INSERT INTO ROLES (ROLE_ID, ROLE_NAME, ROLE_DESCRIPTION, IS_SYSTEM_ROLE, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('SUPER_ADMIN', 'Super Administrator', 'Global platform super administrator with unrestricted governance and security auditing', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role-admin', 'Platform Administrator', 'Platform administrator governing models, credentials, and tenant integrations', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role-mlops', 'MLOps Engineer', 'Machine learning operations specialist configuring models, pipelines, and fallbacks', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role-developer', 'Developer', 'Application engineer building conversational experiences and integrating endpoints', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role-viewer', 'Read-Only Auditor', 'Auditor inspecting telemetry, lineage sessions, and security compliance', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (ROLE_ID) DO NOTHING;

-- 4. PERMISSIONS
INSERT INTO PERMISSIONS (PERMISSION_ID, PERMISSION_CODE, RESOURCE_NAME, ACTION_NAME, DESCRIPTION_TEXT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('perm-chat-read', 'chat:read', 'chat', 'read', 'View active chat messages and responses', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-chat-write', 'chat:write', 'chat', 'write', 'Execute inference prompts and multi-turn conversational agents', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-models-read', 'models:read', 'models', 'read', 'Inspect AI models catalog and performance characteristics', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-models-manage', 'models:manage', 'models', 'manage', 'Configure model providers, credentials, and OAuth tokens', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-sessions-read', 'sessions:read', 'sessions', 'read', 'Inspect conversation session lineage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-sessions-manage', 'sessions:manage', 'sessions', 'manage', 'Create, spawn, and delete conversation sessions', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-telemetry-read', 'telemetry:read', 'telemetry', 'read', 'View distributed trace trails, spans, and latency metrics', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-rbac-manage', 'rbac:manage', 'rbac', 'manage', 'Govern tenant users, roles, and authorization policies', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-onboarding-manage', 'onboarding:manage', 'onboarding', 'manage', 'Onboard new model providers and protocol strategies', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-read', 'integrations:read', 'integrations', 'read', 'View Integration Hub catalog and configured provider details', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-create', 'integrations:create', 'integrations', 'create', 'Onboard new external integrations and providers in Integration Hub', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-update', 'integrations:update', 'integrations', 'update', 'Update existing integrations, endpoints, and credential accounts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm-integrations-delete', 'integrations:delete', 'integrations', 'delete', 'Delete or decommission custom integrations and disconnect accounts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (PERMISSION_ID) DO NOTHING;

-- 4B. ROLE_PERMISSIONS
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT r.ROLE_ID, p.PERMISSION_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM ROLES r
JOIN PERMISSIONS p ON r.ROLE_ID IN ('SUPER_ADMIN', 'role-admin')
ON CONFLICT (ROLE_ID, PERMISSION_ID) DO NOTHING;

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

INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT 'role-viewer', p.PERMISSION_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM PERMISSIONS p
WHERE p.PERMISSION_CODE IN (
    'chat:read', 'models:read', 'sessions:read', 'telemetry:read', 'integrations:read'
)
ON CONFLICT (ROLE_ID, PERMISSION_ID) DO NOTHING;

-- 5. USERS
INSERT INTO USERS (USER_ID, COMPANY_ID, ROLE_ID, FULL_NAME, USER_EMAIL, PASSWORD_HASH, AVATAR_URL, IS_ACTIVE, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('usr-admin', 'comp-platform', 'role-admin', 'Platform Administrator', 'admin@model-connector.local', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '👤', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-mlops', 'acme-corp', 'role-mlops', 'Alex Chen (MLOps Lead)', 'alex.chen@acme.corp', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '⚡', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-dev', 'acme-corp', 'role-developer', 'Sarah Connor (AI Dev)', 'sarah.c@acme.corp', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '👩‍💻', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-auditor', 'research-lab', 'role-viewer', 'Morgan Vance (Auditor)', 'auditor@research.ai', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '🔍', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (USER_ID) DO NOTHING;

-- 6. MENUS
INSERT INTO MENUS (MENU_ID, MENU_LABEL, MENU_ICON, ROUTE_PATH, BADGE_COUNT_KEY, SORT_ORDER, IS_DEFAULT, REQUIRED_PERMISSION, DESCRIPTION_TEXT, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('menu-chat', 'AI Chat', '💬', 'chat', NULL, 1, TRUE, 'chat:read', 'Omni-channel AI chat and multimodal execution', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-models', 'Models', '🤖', 'models', 'models', 3, TRUE, 'models:read', 'Discover and manage AI models across providers', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-model-config', 'Integration Hub', '🪪', 'model-config', 'accounts', 2, TRUE, 'integrations:read', 'Discover, connect, and manage external services and model credentials', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-sessions', 'Sessions', '🗂️', 'sessions', 'sessions', 4, TRUE, 'sessions:read', 'Persistent session lineage and conversation history', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-upstream', 'Telemetry', '📡', 'upstream', 'auditLogs', 5, TRUE, 'telemetry:read', 'Upstream health and distributed audit telemetry', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-workflows', 'Workflows', '📊', 'workflows', NULL, 6, TRUE, NULL, 'Executive telemetry, task transitions, and workflow ledger', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-onboarding', 'Onboarding', '🚀', 'onboarding', NULL, 7, TRUE, 'onboarding:manage', 'Onboard new model providers and OAuth clients', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('menu-admin-rbac', 'Access / RBAC', '🛡️', 'admin-rbac', NULL, 8, TRUE, 'rbac:manage', 'Role-based access control and governance matrix', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (MENU_ID) DO NOTHING;

-- 7. ROLE_MENUS
INSERT INTO ROLE_MENUS (ROLE_ID, MENU_ID, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT r.ROLE_ID, m.MENU_ID, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM ROLES r, MENUS m
ON CONFLICT (ROLE_ID, MENU_ID) DO NOTHING;

-- 8. COMPANY_MENUS
INSERT INTO COMPANY_MENUS (COMPANY_ID, MENU_ID, IS_ENABLED, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
SELECT c.COMPANY_ID, m.MENU_ID, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM COMPANIES c, MENUS m
ON CONFLICT (COMPANY_ID, MENU_ID) DO NOTHING;

