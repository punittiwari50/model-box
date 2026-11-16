import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ObjectConnectionPool, PoolAcquireTimeoutException } from "@/pool/connectionPool.js";

describe("ObjectConnectionPool Tests", () => {
  it("initializes minimum connections and acquires/releases cleanly", async () => {
    let created = 0;
    const pool = new ObjectConnectionPool(
      async () => ({ id: ++created }),
      { minConnections: 2, maxConnections: 3 }
    );
    await pool.init();

    assert.strictEqual(pool.availableCount, 2);
    const conn1 = await pool.acquire();
    assert.strictEqual(pool.activeCount, 1);
    assert.strictEqual(pool.availableCount, 1);

    pool.release(conn1);
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.availableCount, 2);
    await pool.destroy();
  });

  it("throws PoolAcquireTimeoutException when exhausted and timeout elapses", async () => {
    const pool = new ObjectConnectionPool(
      async () => ({ id: 1 }),
      { minConnections: 1, maxConnections: 1, acquireTimeoutMs: 50 }
    );
    await pool.init();

    const conn1 = await pool.acquire();
    assert.strictEqual(pool.activeCount, 1);

    await assert.rejects(
      async () => pool.acquire(),
      PoolAcquireTimeoutException
    );

    pool.release(conn1);
    await pool.destroy();
  });
});
