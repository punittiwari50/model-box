import type { IDataSourceDriver, DataSourceDriverResult } from '@/core/datasource/driver.js';
import { logger } from '@/core/observability/logging/logger.js';

export interface DataSourcePoolConfig {
  readonly minConnections?: number;
  readonly maxConnections?: number;
  readonly acquireTimeoutMs?: number;
}

/**
 * Enterprise DataSource Connection Pool (HikariCP / DBCP inspired).
 * Conforms to:
 * - Directive #2: Rename db to datasource in database implementations
 * - Directive #3: Common datasource implementation in core/
 * - Directive #8 & #9: Clean logging and observability
 */
export class DataSourceConnectionPool implements IDataSourceDriver {
  private readonly factory: () => Promise<IDataSourceDriver>;
  private readonly minConnections: number;
  private readonly maxConnections: number;
  private readonly acquireTimeoutMs: number;

  private available: IDataSourceDriver[] = [];
  private inUse = new Set<IDataSourceDriver>();
  private waitQueue: Array<{
    resolve: (conn: IDataSourceDriver) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(
    factory: () => Promise<IDataSourceDriver>,
    config: DataSourcePoolConfig = {}
  ) {
    this.factory = factory;
    this.minConnections = config.minConnections ?? 1;
    this.maxConnections = config.maxConnections ?? 5;
    this.acquireTimeoutMs = config.acquireTimeoutMs ?? 5000;
  }

  public async init(): Promise<void> {
    for (let i = 0; i < this.minConnections; i++) {
      const conn = await this.factory();
      this.available.push(conn);
    }
    logger.datasource(`DataSourceConnectionPool: Initialized with ${this.available.length} connection(s). (Max: ${this.maxConnections})`);
  }

  public async acquire(): Promise<IDataSourceDriver> {
    if (this.available.length > 0) {
      const conn = this.available.pop()!;
      this.inUse.add(conn);
      return conn;
    }

    if (this.inUse.size + this.available.length < this.maxConnections) {
      const conn = await this.factory();
      this.inUse.add(conn);
      return conn;
    }

    return new Promise<IDataSourceDriver>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((entry) => entry.resolve === resolve);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
        }
        reject(
          new Error(
            `DataSource pool acquire timeout (${this.acquireTimeoutMs}ms). Active: ${this.inUse.size}, Available: ${this.available.length}, Queued: ${this.waitQueue.length}`
          )
        );
      }, this.acquireTimeoutMs);
      timer.unref?.();

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  public release(conn: IDataSourceDriver): void {
    if (!this.inUse.has(conn)) {
      return;
    }
    this.inUse.delete(conn);

    if (this.waitQueue.length > 0) {
      const { resolve, timer } = this.waitQueue.shift()!;
      clearTimeout(timer);
      this.inUse.add(conn);
      resolve(conn);
      return;
    }

    this.available.push(conn);
  }

  public async run(sql: string, params: any[] = []): Promise<DataSourceDriverResult> {
    const conn = await this.acquire();
    try {
      return await conn.run(sql, params);
    } finally {
      this.release(conn);
    }
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const conn = await this.acquire();
    try {
      return await conn.get<T>(sql, params);
    } finally {
      this.release(conn);
    }
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const conn = await this.acquire();
    try {
      return await conn.all<T>(sql, params);
    } finally {
      this.release(conn);
    }
  }

  public async close(): Promise<void> {
    for (const { reject, timer } of this.waitQueue) {
      clearTimeout(timer);
      reject(new Error('DataSourceConnectionPool is shutting down.'));
    }
    this.waitQueue = [];

    const allConns = [...this.available, ...this.inUse];
    for (const conn of allConns) {
      await conn.close().catch(() => {});
    }
    this.available = [];
    this.inUse.clear();
    logger.datasource('DataSourceConnectionPool: All connections closed.');
  }

  public getPoolStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      queued: this.waitQueue.length,
      total: this.available.length + this.inUse.size,
    };
  }
}

// Backward compatibility alias
export class DatabaseConnectionPool extends DataSourceConnectionPool {}
