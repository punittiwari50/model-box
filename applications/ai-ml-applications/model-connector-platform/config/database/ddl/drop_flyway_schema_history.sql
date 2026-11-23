-- ==============================================================================
-- Reset Flyway Schema History DDL
-- Drops FLYWAY_SCHEMA_HISTORY table for clean environment re-initialization
-- ==============================================================================

DROP TABLE IF EXISTS FLYWAY_SCHEMA_HISTORY;
