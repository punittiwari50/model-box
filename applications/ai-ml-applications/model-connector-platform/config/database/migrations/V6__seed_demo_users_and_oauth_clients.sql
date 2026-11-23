-- ==============================================================================
-- Flyway Migration V6: Seed Canonical Demo Users & Provider OAuth Clients
-- Conforms to:
-- - Flyway migration strategy for demo data in database repository
-- - Zero hardcoded sensitive client credentials in TypeScript, YAML, .env, or Dockerfile
-- - Seed demo users into USERS table
-- - Seed Provider OAuth Clients into PROVIDER_OAUTH_CLIENTS table
-- ==============================================================================

-- 1. Demo User Seeds
INSERT INTO USERS (USER_ID, COMPANY_ID, ROLE_ID, FULL_NAME, USER_EMAIL, PASSWORD_HASH, AVATAR_URL, IS_ACTIVE, CREATED_TIMESTAMP, UPDATED_TIMESTAMP)
VALUES
    ('usr-admin', 'comp-platform', 'role-admin', 'Platform Administrator', 'admin@modelbox.internal', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '👤', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-mlops', 'acme-corp', 'role-mlops', 'MLOps Lead', 'mlops@modelbox.internal', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '⚡', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-dev', 'acme-corp', 'role-developer', 'AI Developer', 'developer@modelbox.internal', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '👩‍💻', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-auditor', 'research-lab', 'role-viewer', 'Compliance Auditor', 'auditor@modelbox.internal', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '🔍', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('usr-analyst', 'acme-corp', 'role-viewer', 'Telemetry Analyst', 'analyst@modelbox.internal', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '📊', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (USER_ID) DO UPDATE SET
    USER_EMAIL = EXCLUDED.USER_EMAIL,
    FULL_NAME = EXCLUDED.FULL_NAME,
    UPDATED_TIMESTAMP = CURRENT_TIMESTAMP;

-- 2. Seed Default Provider OAuth Client for Google Cloud / Gemini CLI
INSERT INTO PROVIDER_OAUTH_CLIENTS (
    OAUTH_CLIENT_CONFIG_ID,
    PROVIDER_ID,
    MODEL_ID,
    CLIENT_ALIAS,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    SCOPES_TEXT,
    IS_DEFAULT,
    IS_ACTIVE,
    CREATED_TIMESTAMP,
    UPDATED_TIMESTAMP
) VALUES (
    'oauth-client-google-gemini-cli',
    'google',
    '*',
    'Google Cloud Gemini Desktop Client',
    '',
    '',
    'http://localhost:8085/oauth2callback',
    'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (OAUTH_CLIENT_CONFIG_ID) DO UPDATE SET
    CLIENT_ID = EXCLUDED.CLIENT_ID,
    UPDATED_TIMESTAMP = CURRENT_TIMESTAMP;

-- 3. Seed Default Provider OAuth Client for OpenAI ChatGPT
INSERT INTO PROVIDER_OAUTH_CLIENTS (
    OAUTH_CLIENT_CONFIG_ID,
    PROVIDER_ID,
    MODEL_ID,
    CLIENT_ALIAS,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    SCOPES_TEXT,
    IS_DEFAULT,
    IS_ACTIVE,
    CREATED_TIMESTAMP,
    UPDATED_TIMESTAMP
) VALUES (
    'oauth-client-openai-desktop',
    'openai',
    '*',
    'OpenAI ChatGPT Desktop Client',
    'modelbox-openai-desktop-client',
    '',
    'http://localhost:8085/oauth2callback',
    'openid profile email model.request',
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (OAUTH_CLIENT_CONFIG_ID) DO UPDATE SET
    CLIENT_ID = EXCLUDED.CLIENT_ID,
    UPDATED_TIMESTAMP = CURRENT_TIMESTAMP;

-- 4. Seed Default Provider OAuth Client for Anthropic Claude
INSERT INTO PROVIDER_OAUTH_CLIENTS (
    OAUTH_CLIENT_CONFIG_ID,
    PROVIDER_ID,
    MODEL_ID,
    CLIENT_ALIAS,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    SCOPES_TEXT,
    IS_DEFAULT,
    IS_ACTIVE,
    CREATED_TIMESTAMP,
    UPDATED_TIMESTAMP
) VALUES (
    'oauth-client-anthropic-desktop',
    'anthropic',
    '*',
    'Anthropic Claude Desktop Client',
    'modelbox-claude-desktop-client',
    '',
    'http://localhost:8085/oauth2callback',
    'claude:read claude:write openid email',
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (OAUTH_CLIENT_CONFIG_ID) DO UPDATE SET
    CLIENT_ID = EXCLUDED.CLIENT_ID,
    UPDATED_TIMESTAMP = CURRENT_TIMESTAMP;

-- 5. Seed Default Provider OAuth Client for xAI Grok
INSERT INTO PROVIDER_OAUTH_CLIENTS (
    OAUTH_CLIENT_CONFIG_ID,
    PROVIDER_ID,
    MODEL_ID,
    CLIENT_ALIAS,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    SCOPES_TEXT,
    IS_DEFAULT,
    IS_ACTIVE,
    CREATED_TIMESTAMP,
    UPDATED_TIMESTAMP
) VALUES (
    'oauth-client-xai-desktop',
    'xai',
    '*',
    'xAI Grok Desktop Client',
    'modelbox-xai-desktop-client',
    '',
    'http://localhost:8085/oauth2callback',
    'model.read model.completion openid email',
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (OAUTH_CLIENT_CONFIG_ID) DO UPDATE SET
    CLIENT_ID = EXCLUDED.CLIENT_ID,
    UPDATED_TIMESTAMP = CURRENT_TIMESTAMP;
