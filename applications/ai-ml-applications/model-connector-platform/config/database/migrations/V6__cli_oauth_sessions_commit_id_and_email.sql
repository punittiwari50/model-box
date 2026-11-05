-- ==============================================================================
-- Flyway Migration V6: CLI OAuth Sessions Git Commit ID and User Email Schema
-- Tracks in-container Git commit ID and authenticated user email per session
-- Conforms to: STD-COD-002, Invariant Table & Column Naming (UPPER CASE)
-- ==============================================================================

ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN COMMIT_ID TEXT;
ALTER TABLE CLI_OAUTH_SESSIONS ADD COLUMN USER_EMAIL TEXT;
