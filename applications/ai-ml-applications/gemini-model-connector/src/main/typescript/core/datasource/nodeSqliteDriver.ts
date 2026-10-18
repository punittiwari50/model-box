import fs from 'node:fs';
import path from 'node:path';
import type { IDataSourceDriver, DataSourceDriverResult } from '@/core/datasource/driver.js';

/**
 * Built-in node:sqlite driver for Node 22+ environments.
 */
export class NodeSqliteDataSourceDriver implements IDataSourceDriver {
  private db: any = null;
  private readonly dataSourcePath: string;

  constructor(dataSourcePath: string) {
    this.dataSourcePath = dataSourcePath;
  }

  public async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.dataSourcePath), { recursive: true });
    const sqliteModule = await import('node:sqlite');
    this.db = new sqliteModule.DatabaseSync(this.dataSourcePath);
    this.db.exec(`
      PRAGMA JOURNAL_MODE = WAL;
      PRAGMA SYNCHRONOUS = NORMAL;
      PRAGMA busy_timeout = 10000;
      PRAGMA FOREIGN_KEYS = ON;
    `);
  }

  public async run(sql: string, params: any[] = []): Promise<DataSourceDriverResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }
}
