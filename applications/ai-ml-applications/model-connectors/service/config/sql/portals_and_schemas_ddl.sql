-- =============================================================================
-- Enterprise Trusted Company Portals & Official Response Schemas (DDL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trusted_company_portals (
    portal_id VARCHAR(64) PRIMARY KEY,
    company_name VARCHAR(128) NOT NULL,
    official_domain VARCHAR(128) NOT NULL,
    portal_url TEXT NOT NULL,
    portal_type VARCHAR(64) NOT NULL, -- 'company_official', 'enterprise_ats', 'professional_network'
    logo_url TEXT NOT NULL,
    logo_format VARCHAR(16) NOT NULL DEFAULT 'svg',
    verification_source TEXT NOT NULL,
    search_url_template TEXT NOT NULL,
    supported_schemas_json TEXT NOT NULL DEFAULT '["https://schema.org/JobPosting"]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_portals_type ON trusted_company_portals(portal_type);
CREATE INDEX IF NOT EXISTS idx_portals_domain ON trusted_company_portals(official_domain);
CREATE INDEX IF NOT EXISTS idx_portals_active ON trusted_company_portals(is_active);

CREATE TABLE IF NOT EXISTS official_response_schemas (
    schema_id VARCHAR(64) PRIMARY KEY,
    schema_name VARCHAR(128) NOT NULL,
    specification_url TEXT NOT NULL,
    target_site_or_standard VARCHAR(128) NOT NULL,
    json_schema_definition TEXT NOT NULL,
    sample_template_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schemas_active ON official_response_schemas(is_active);
