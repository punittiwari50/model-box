import { DatabaseSync } from "node:sqlite";

/**
 * Enterprise SQLite Database Utility.
 * Exclusive authority for node:sqlite access across the platform.
 * Conforms to:
 * - STD-COD-010: Runtime Isolation & Encapsulation
 * - STD-COD-007: Clean Code & Resilient Errors
 */
export function createDatabaseSync(path: string, options?: unknown): DatabaseSync {
  return options !== undefined ? new DatabaseSync(path, options as any) : new DatabaseSync(path);
}

export { DatabaseSync };
export type { DatabaseSync as DatabaseSyncType };
