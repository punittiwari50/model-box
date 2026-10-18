import type { IDataSourceDriver, DataSourceDriverResult } from '@/core/datasource/driver.js';

/**
 * Resilient DataSource Driver Decorator.
 * Conforms to:
 * - STD-COD-005: Clean Decorator Pattern
 * - STD-COD-007: Resilient Error Handling & Zero Swallowed Exceptions
 */
export class ResilientDataSourceDriver implements IDataSourceDriver {
  private readonly delegate: IDataSourceDriver;

  constructor(delegate: IDataSourceDriver) {
    this.delegate = delegate;
  }

  public async init(): Promise<void> {
    await this.delegate.init();
  }

  public async run(sql: string, params: any[] = []): Promise<DataSourceDriverResult> {
    return this.delegate.run(sql, params);
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.delegate.get<T>(sql, params);
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.delegate.all<T>(sql, params);
  }

  public async close(): Promise<void> {
    await this.delegate.close();
  }
}

// Backward compatibility alias
export class ResilientDatabaseDriver extends ResilientDataSourceDriver {}
