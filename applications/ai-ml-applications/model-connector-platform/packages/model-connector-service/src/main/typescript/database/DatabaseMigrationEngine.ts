import {
  CoreFlywayMigrationRunner,
  type DatabaseSync,
  environment,
} from "@model-box/model-connector-core";
import { postgresConnectionManager } from "@/database/PostgresConnectionManager";
import { PostgresMigrationRunner } from "@/database/PostgresMigrationRunner";

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
 * Flyway Migration Runner for H2/embedded SQLite fallback, and PostgresMigrationRunner for PostgreSQL.
 * Conforms to Requirement #1 (H2 default/fallback) & Requirement #2 (DDL/DML in Postgres).
 */
export class DatabaseMigrationEngine {
  public static migrate(db: DatabaseSync): void {
    CoreFlywayMigrationRunner.migrate(db);
  }

  public static async initializePostgresAndMigrate(): Promise<{
    postgresActive: boolean;
    migrationsExecuted: number;
    fallbackActive: boolean;
  }> {
    const defaultMode = environment.getProperty("datasource.default", "h2");
    const fallbackMode = environment.getProperty("datasource.fallback", "h2");
    const configuredType = environment.getProperty("datasource.type", defaultMode);

    console.log(`[DatabaseMigrationEngine] Database mode configured: '${configuredType}' (default/fallback: '${fallbackMode}')`);

    const status = await postgresConnectionManager.testConnection();
    if (status.connected) {
      console.log(`[DatabaseMigrationEngine] PostgreSQL 17 connected at ${status.host}:${status.port}/${status.database}. Running DDL and DML...`);
      const results = await PostgresMigrationRunner.migrate(postgresConnectionManager);
      const successfulCount = results.filter((r) => r.success).length;
      console.log(`[DatabaseMigrationEngine] PostgreSQL DDL & DML complete: ${successfulCount}/${results.length} scripts applied.`);
      return { postgresActive: true, migrationsExecuted: successfulCount, fallbackActive: false };
    }

    console.warn(
      `[DatabaseMigrationEngine] PostgreSQL not reachable (${status.error || "offline"}). Falling back to default '${fallbackMode}' database.`
    );
    return { postgresActive: false, migrationsExecuted: 0, fallbackActive: true };
  }
}
