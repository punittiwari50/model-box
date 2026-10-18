import path from 'node:path';
import { config, dataSourceProperties } from '@/core/config/index.js';
import { logger } from '@/core/observability/logging/logger.js';
import type { IDataSourceDriver } from '@/core/datasource/driver.js';
import { NodeSqliteDataSourceDriver } from '@/core/datasource/nodeSqliteDriver.js';
import { FileStoreDataSourceDriver } from '@/core/datasource/fileStoreDriver.js';
import { DataSourceConnectionPool } from '@/core/datasource/connectionPool.js';
import { ResilientDataSourceDriver } from '@/core/datasource/resilientDriver.js';
import { dataSourceInitialLoader } from '@/core/datasource/initialLoader.js';

/**
 * Enterprise DataSource Manager.
 * Orchestrates connection pooling, driver fallback, schema migration, and resilience decorators.
 *
 * Conforms to:
 * - Directive #2: Rename db to datasource in database implementations
 * - Directive #3: Common datasource implementation under core/
 * - Directive #2 (Updated): Only in-memory RDBMS database will need storage; external databases
 *   use connection string (URL) rather than storage directories.
 */
export class DataSourceManager {
  private driver: IDataSourceDriver | null = null;
  private readonly customPath?: string;

  constructor(customPath?: string) {
    this.customPath = customPath;
  }

  /**
   * Resolves the target database identifier / connection string / storage path lazily.
   */
  public getDataSourceTarget(): string {
    if (this.customPath) {
      return this.customPath;
    }
    // If external RDBMS, prioritize connection string URL without requiring file storage
    if (dataSourceProperties.isExternalRdbms()) {
      return dataSourceProperties.getConnectionString();
    }
    // In-memory or local embedded database
    if (dataSourceProperties.isInMemory()) {
      return ':memory:';
    }
    return path.join(config.dataDir, config.databaseName);
  }

  public async getDriver(): Promise<IDataSourceDriver> {
    if (this.driver) {
      return this.driver;
    }

    const target = this.getDataSourceTarget();

    // 1. Setup Connection Pool with Retry & Concurrency Governance
    const pool = new DataSourceConnectionPool(
      async () => this.createRawDriver(target),
      {
        minConnections: config.dbPoolMin,
        maxConnections: config.dbPoolMax,
        acquireTimeoutMs: config.dbPoolAcquireTimeoutMs,
      }
    );
    await pool.init();

    // 2. Conditionally load DDL/DML scripts (only if in-memory or explicitly enabled)
    await dataSourceInitialLoader.loadAndExecute(pool, target);

    // 3. Decorate with ResilientDataSourceDriver
    this.driver = new ResilientDataSourceDriver(pool);
    return this.driver;
  }

  public async getDataSource(): Promise<IDataSourceDriver> {
    return this.getDriver();
  }

  private async createRawDriver(target: string): Promise<IDataSourceDriver> {
    try {
      const nodeSqlite = new NodeSqliteDataSourceDriver(target);
      await nodeSqlite.init();
      logger.datasource(`Connected with node:sqlite at ${target}`);
      return nodeSqlite;
    } catch (e: any) {
      logger.datasource(`node:sqlite not enabled (${e.message}). Falling back to durable JSON file-backed driver.`);
      const fileDriver = new FileStoreDataSourceDriver(target);
      await fileDriver.init();
      return fileDriver;
    }
  }

  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close().catch(() => {});
      this.driver = null;
    }
  }
}

export const dataSourceManager = new DataSourceManager();

// Backward compatibility alias
export const dbManager = dataSourceManager;
export class DatabaseManager extends DataSourceManager {}
