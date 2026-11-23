import { type Environment } from "@/config/environment.js";

export type NoSqlEngine = "mongodb" | "redis" | "dynamodb" | "documentdb";

export interface NoSqlPoolOptions {
  readonly minPoolSize: number;
  readonly maxPoolSize: number;
  readonly connectTimeoutMs: number;
  readonly socketTimeoutMs: number;
  readonly maxIdleTimeMs: number;
}

export interface NoSqlCollections {
  readonly conversations: string;
  readonly messages: string;
  readonly contextItems: string;
  readonly auditLogs: string;
  readonly modelCache: string;
}

export interface NoSqlConfig {
  readonly enabled: boolean;
  readonly engine: NoSqlEngine;
  readonly uri: string;
  readonly databaseName: string;
  readonly collections: NoSqlCollections;
  readonly pool: NoSqlPoolOptions;
  readonly tls: boolean;
  readonly retryWrites: boolean;
}

export const DEFAULT_NOSQL_COLLECTIONS: NoSqlCollections = Object.freeze({
  conversations: "CONVERSATIONS",
  messages: "MESSAGES",
  contextItems: "CONTEXT_ITEMS",
  auditLogs: "AUDIT_LOGS",
  modelCache: "MODEL_CACHE",
});

/**
 * Loads enterprise NoSQL configuration using Spring-style Environment binding.
 */
export function loadNoSqlConfig(env: Environment): NoSqlConfig {
  const enabled = env.getPropertyAsBoolean("nosql.enabled", false);
  const engine = (env.getProperty("nosql.engine", "mongodb") as NoSqlEngine) ?? "mongodb";
  const uri = env.getProperty(
    "nosql.uri",
    "mongodb://localhost:27017/model_connector"
  );
  const databaseName = env.getProperty("nosql.database-name", "model_connector");

  return {
    enabled,
    engine,
    uri,
    databaseName,
    collections: DEFAULT_NOSQL_COLLECTIONS,
    pool: {
      minPoolSize: env.getPropertyAsNumber("nosql.pool.min-size", 5),
      maxPoolSize: env.getPropertyAsNumber("nosql.pool.max-size", 20),
      connectTimeoutMs: env.getPropertyAsNumber("nosql.pool.connect-timeout-ms", 10000),
      socketTimeoutMs: env.getPropertyAsNumber("nosql.pool.socket-timeout-ms", 30000),
      maxIdleTimeMs: env.getPropertyAsNumber("nosql.pool.max-idle-ms", 60000),
    },
    tls: env.getPropertyAsBoolean("nosql.tls", false),
    retryWrites: env.getPropertyAsBoolean("nosql.retry-writes", true),
  };
}
