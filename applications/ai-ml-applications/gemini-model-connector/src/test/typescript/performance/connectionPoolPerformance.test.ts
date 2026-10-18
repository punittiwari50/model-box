import { describe, it } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import fs from 'node:fs';
import { DataSourceConnectionPool } from '@/core/datasource/connectionPool.js';
import { NodeSqliteDataSourceDriver } from '@/core/datasource/nodeSqliteDriver.js';
import { config } from '@/core/config/index.js';

describe('Performance & Concurrency (DataSource Connection Pool Throughput)', () => {
  const perfDbPath = path.join(config.dataDir, 'perf_benchmark.db');
  let pool: DataSourceConnectionPool;

  it('should handle 50 concurrent transactions without pool starvation or deadlocks', async () => {
    pool = new DataSourceConnectionPool(
      async () => {
        const driver = new NodeSqliteDataSourceDriver(perfDbPath);
        await driver.init();
        return driver;
      },
      { minConnections: 2, maxConnections: 10, acquireTimeoutMs: 5000 }
    );
    await pool.init();

    const concurrentOperations = 50;
    const start = performance.now();

    // Initialize test table from unified master schema-ddl.sql file
    const perfDdlPath = path.join(config.projectRoot, 'config', 'scripts', 'sql', 'schema-ddl.sql');
    const ddlContent = fs.readFileSync(perfDdlPath, 'utf-8');
    const statements = ddlContent
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      await pool.run(statement);
    }

    const tasks = Array.from({ length: concurrentOperations }, async (_, i) => {
      await pool.run('INSERT INTO PERF_TEST (VAL) VALUES (?);', [`value-${i}`]);
      const row = await pool.get('SELECT COUNT(*) as CNT FROM PERF_TEST;');
      return row ? Number((row as any).CNT ?? (row as any).cnt) : 0;
    });

    const results = await Promise.all(tasks);
    const elapsedMs = performance.now() - start;

    assert.strictEqual(results.length, concurrentOperations);
    assert.ok(elapsedMs < 5000, `Expected 50 operations to complete under 5000ms, took ${elapsedMs}ms`);
  });

  it('cleanup: should close driver connections cleanly', async () => {
    if (pool) {
      await pool.close();
    }
    if (fs.existsSync(perfDbPath)) {
      try {
        fs.unlinkSync(perfDbPath);
      } catch {
        // safely ignore on lock release
      }
    }
  });
});
