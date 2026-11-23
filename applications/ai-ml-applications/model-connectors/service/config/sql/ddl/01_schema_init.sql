-- ==============================================================================
-- SCHEMA INITIALIZATION & SEQUENCES DDL
-- Table and column names in UPPER CASE adhering to enterprise SQL standards.
-- Compatible with PostgreSQL and In-Memory ANSI SQL engines.
-- ==============================================================================

-- Primary ID and Ordering Sequences
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_SESSIONS_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_MESSAGES_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_COMPACTIONS_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_CONNECTION_CONFIGS_ID START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS SEQ_MB_TOKEN_METRICS_ID START WITH 1 INCREMENT BY 1;
