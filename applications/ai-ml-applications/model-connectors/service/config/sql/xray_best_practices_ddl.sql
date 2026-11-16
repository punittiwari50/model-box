-- =============================================================================
-- Enterprise Google X-Ray Search Best Practices Schema (DDL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS xray_best_practices (
    practice_id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    boolean_pattern TEXT NOT NULL,
    target_domains TEXT NOT NULL, -- JSON array of official domains
    weight INTEGER NOT NULL DEFAULT 100,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_xray_practices_category ON xray_best_practices(category);
CREATE INDEX IF NOT EXISTS idx_xray_practices_active ON xray_best_practices(is_active);
