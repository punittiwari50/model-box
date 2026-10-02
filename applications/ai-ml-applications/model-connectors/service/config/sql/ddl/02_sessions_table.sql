-- ==============================================================================
-- SESSIONS TABLE DDL
-- Table and column names in UPPER CASE adhering to enterprise SQL standards.
-- Compatible with PostgreSQL and In-Memory ANSI SQL (SQLite / H2).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS MB_SESSIONS (
    SESSION_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(128) NOT NULL,
    COOKIE_ID VARCHAR(256) NOT NULL,
    CREATED_AT TIMESTAMP NOT NULL,
    UPDATED_AT TIMESTAMP NOT NULL,
    METADATA_JSON TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_USER_ID ON MB_SESSIONS (USER_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_COOKIE_ID ON MB_SESSIONS (COOKIE_ID);
CREATE INDEX IF NOT EXISTS IDX_MB_SESSIONS_UPDATED_AT ON MB_SESSIONS (UPDATED_AT);
