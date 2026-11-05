-- ==============================================================================
-- Flyway Migration V7: Model Accounts Auth Code Persistence
-- Stores the received OAuth authorization code directly against model accounts
-- Conforms to: STD-COD-002, Invariant Table & Column Naming (UPPER CASE)
-- ==============================================================================

ALTER TABLE MODEL_ACCOUNTS ADD COLUMN AUTH_CODE TEXT;
