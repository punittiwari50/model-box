import pg from "pg";

export interface PostgresConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password?: string;
  readonly ssl?: boolean | object;
  readonly max?: number;
  readonly min?: number;
  readonly connectionTimeoutMillis?: number;
  readonly idleTimeoutMillis?: number;
}

/**
 * Enterprise PostgreSQL Database Utility.
 * Exclusive authority for PostgreSQL pool and client management.
 * Conforms to STD-COD-011, STD-COD-005, and STD-COD-007.
 */
export function createPgPool(config: PostgresConnectionConfig): pg.Pool {
  return new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: config.max ?? 10,
    min: config.min ?? 2,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
  });
}

export function createPgClient(config: PostgresConnectionConfig): pg.Client {
  return new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
  });
}

export { pg };
export type { Pool as PgPool, Client as PgClient, QueryResult as PgQueryResult } from "pg";
