/**
 * Enterprise DataSource Driver Contract.
 * Conforms to:
 * - Directive #2: Rename db to datasource in database implementations
 * - Directive #3: Common datasource implementation in core/
 */

export interface DataSourceDriverResult {
  readonly changes: number;
  readonly lastInsertRowid?: number | bigint;
}

export interface IDataSourceDriver {
  init(): Promise<void>;
  run(sql: string, params?: any[]): Promise<DataSourceDriverResult>;
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  close(): Promise<void>;
}

// Backward compatibility alias
export type IDatabaseDriver = IDataSourceDriver;
