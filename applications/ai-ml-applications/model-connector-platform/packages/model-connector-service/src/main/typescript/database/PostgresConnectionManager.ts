import {
  environment,
  createPgPool,
  type PgPool,
  type PostgresConnectionConfig,
} from "@model-box/model-connector-core";

export interface PostgresConnectionStatus {
  readonly connected: boolean;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly latencyMs: number;
  readonly tablesCount?: number;
  readonly version?: string;
  readonly error?: string;
}

/**
 * Enterprise PostgreSQL Connection Manager.
 * Governs connection pooling and resilience for PostgreSQL 17.
 * Conforms to STD-COD-005, STD-COD-007, and STD-COD-010.
 */
export class PostgresConnectionManager {
  private static instance: PostgresConnectionManager | null = null;
  private pool: PgPool | null = null;
  private readonly config: PostgresConnectionConfig;

  private constructor() {
    this.config = Object.freeze({
      host: environment.getProperty("POSTGRES_HOST", environment.getProperty("datasource.postgres.host", "postgres")),
      port: environment.getPropertyAsNumber("POSTGRES_PORT", environment.getPropertyAsNumber("datasource.postgres.port", 5432)),
      database: environment.getProperty("POSTGRES_DB", environment.getProperty("datasource.postgres.database", "model_connector_db")),
      user: environment.getProperty("POSTGRES_USER", environment.getProperty("datasource.postgres.username", "postgres")),
      password: environment.getProperty("POSTGRES_PASSWORD", environment.getProperty("datasource.postgres.password", "postgres")),
      ssl: environment.getPropertyAsBoolean("POSTGRES_SSL", environment.getPropertyAsBoolean("datasource.postgres.ssl", false)),
      max: environment.getPropertyAsNumber("datasource.postgres.pool.max", 10),
      min: environment.getPropertyAsNumber("datasource.postgres.pool.min", 2),
      connectionTimeoutMillis: environment.getPropertyAsNumber("datasource.postgres.pool.acquireTimeoutMs", 5000),
    });
  }

  public static getInstance(): PostgresConnectionManager {
    if (!this.instance) {
      this.instance = new PostgresConnectionManager();
    }
    return this.instance;
  }

  public getPool(): PgPool {
    if (!this.pool) {
      this.pool = createPgPool(this.config);
    }
    return this.pool;
  }

  public async testConnection(): Promise<PostgresConnectionStatus> {
    const startTime = Date.now();
    try {
      const pool = this.getPool();
      const res = await pool.query(
        "SELECT version(), current_database(), count(*)::int as table_count FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const row = res.rows[0] || {};
      return {
        connected: true,
        host: this.config.host,
        port: this.config.port,
        database: String(row.current_database || this.config.database),
        user: this.config.user,
        latencyMs: Date.now() - startTime,
        tablesCount: Number(row.table_count || 0),
        version: String(row.version || "PostgreSQL 17"),
      };
    } catch (err: unknown) {
      return {
        connected: false,
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = this.getPool();
    const result = await pool.query(sql, params);
    return result.rows as T[];
  }

  public async execute(sql: string, params: unknown[] = []): Promise<number> {
    const pool = this.getPool();
    const result = await pool.query(sql, params);
    return result.rowCount ?? 0;
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const postgresConnectionManager = PostgresConnectionManager.getInstance();

