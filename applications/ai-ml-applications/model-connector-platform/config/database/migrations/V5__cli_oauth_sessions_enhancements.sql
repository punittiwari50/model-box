-- ==============================================================================
-- Flyway Migration V5: CLI OAuth Sessions Schema Enhancements
-- Support for App vs CLI Redirect URIs, Error Tracking for UI, and Extensible Multi-Model CLIs
-- Conforms to: STD-COD-002, Invariant Table & Column Naming (UPPER CASE)
-- ==============================================================================

ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN CLI_REDIRECT_URI TEXT;
ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN APP_REDIRECT_URI TEXT;
ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN ERROR_MESSAGE TEXT;
ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN ERROR_CODE TEXT;
