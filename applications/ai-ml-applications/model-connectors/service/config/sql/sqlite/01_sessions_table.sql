-- ==============================================================================
-- SQLITE SESSIONS TABLE DDL (In-Memory Engine)
-- Table and column names in UPPER CASE adhering to enterprise SQL standards.
-- ==============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS MB_SESSIONS (
    SESSION_ID TEXT PRIMARY KEY,
    USER_ID TEXT NOT NULL,
    COOKIE_ID TEXT NOT NULL,
    CREATED_AT TEXT NOT NULL,
    UPDATED_AT TEXT NOT NULL,
    METADATA_JSON TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_USER_ID ON MB_SESSIONS (USER_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_COOKIE_ID ON MB_SESSIONS (COOKIE_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_UPDATED_AT ON MB_SESSIONS (UPDATED_AT);
