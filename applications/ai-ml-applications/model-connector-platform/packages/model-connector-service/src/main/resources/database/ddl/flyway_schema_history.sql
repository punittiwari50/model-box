-- ==============================================================================
-- Flyway Schema History Table DDL
-- Conforms to: Flyway standard metadata table for migration tracking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS FLYWAY_SCHEMA_HISTORY (
  INSTALLED_RANK INTEGER PRIMARY KEY,
  VERSION VARCHAR(50),
  DESCRIPTION VARCHAR(200),
  TYPE VARCHAR(20) NOT NULL,
  SCRIPT VARCHAR(1000) NOT NULL,
  CHECKSUM INTEGER,
  INSTALLED_BY VARCHAR(100) NOT NULL,
  INSTALLED_ON TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  EXECUTION_TIME INTEGER NOT NULL,
  SUCCESS BOOLEAN NOT NULL
);
