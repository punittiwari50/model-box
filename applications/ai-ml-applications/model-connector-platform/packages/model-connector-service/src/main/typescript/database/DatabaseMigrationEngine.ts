import {
  CoreFlywayMigrationRunner,
  type DatabaseSync,
} from "@model-box/model-connector-core";

export interface MigrationRecord {
  readonly installedRank: number;
  readonly version: string;
  readonly description: string;
  readonly script: string;
  readonly executionTime: number;
  readonly success: boolean;
}

/**
 * Enterprise Database Migration Engine delegating to centralized @model-box/model-connector-core
 * Flyway Migration Runner (Req 3 & Req 5).
 */
export class DatabaseMigrationEngine {
  public static migrate(db: DatabaseSync): void {
    CoreFlywayMigrationRunner.migrate(db);
  }
}
