-- ==============================================================================
-- SQLITE COMPATIBILITY VIEWS DDL (In-Memory Engine)
-- Exposes lowercase compatibility views for legacy or standard queries.
-- ==============================================================================

CREATE VIEW IF NOT EXISTS sessions AS SELECT * FROM MB_SESSIONS;
CREATE VIEW IF NOT EXISTS messages AS SELECT * FROM MB_MESSAGES;
CREATE VIEW IF NOT EXISTS compactions AS SELECT * FROM MB_COMPACTIONS;
CREATE VIEW IF NOT EXISTS connection_configs AS SELECT * FROM MB_CONNECTION_CONFIGS;
CREATE VIEW IF NOT EXISTS token_metrics AS SELECT * FROM MB_TOKEN_METRICS;
