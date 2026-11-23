export interface PoolConfig {
  readonly minConnections?: number;
  readonly maxConnections?: number;
  readonly acquireTimeoutMs?: number;
}

export class PoolAcquireTimeoutException extends Error {
  constructor(timeoutMs: number, active: number, max: number) {
    super(`[ObjectConnectionPool] Acquire timeout after ${timeoutMs}ms. Active: ${active}, Max: ${max}`);
    this.name = "PoolAcquireTimeoutException";
  }
}

/**
 * Enterprise Generic Object & Connection Pool (HikariCP / DBCP pattern).
 * Provides managed pooling for REST clients, DB drivers, sockets, and computational workers.
 */
export class ObjectConnectionPool<T> {
  private readonly factory: () => Promise<T>;
  private readonly destroyer?: (item: T) => Promise<void>;
  private readonly minConnections: number;
  private readonly maxConnections: number;
  private readonly acquireTimeoutMs: number;

  private available: T[] = [];
  private inUse = new Set<T>();
  private waitQueue: Array<{
    resolve: (item: T) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(
    factory: () => Promise<T>,
    config: PoolConfig = {},
    destroyer?: (item: T) => Promise<void>
  ) {
    this.factory = factory;
    this.destroyer = destroyer;
    this.minConnections = config.minConnections ?? 1;
    this.maxConnections = config.maxConnections ?? 5;
    this.acquireTimeoutMs = config.acquireTimeoutMs ?? 5000;
  }

  public async init(): Promise<void> {
    for (let i = 0; i < this.minConnections; i++) {
      const conn = await this.factory();
      this.available.push(conn);
    }
  }

  public async acquire(): Promise<T> {
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

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((entry) => entry.resolve === resolve);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
        }
        reject(
          new PoolAcquireTimeoutException(
            this.acquireTimeoutMs,
            this.inUse.size,
            this.maxConnections
          )
        );
      }, this.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  public release(item: T): void {
    if (!this.inUse.has(item)) {
      return;
    }
    this.inUse.delete(item);

    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      clearTimeout(next.timer);
      this.inUse.add(item);
      next.resolve(item);
      return;
    }

    this.available.push(item);
  }

  public async runWith<R>(action: (conn: T) => Promise<R>): Promise<R> {
    const conn = await this.acquire();
    try {
      return await action(conn);
    } finally {
      this.release(conn);
    }
  }

  public async destroy(): Promise<void> {
    for (const item of [...this.available, ...this.inUse]) {
      if (this.destroyer) {
        await this.destroyer(item);
      }
    }
    this.available = [];
    this.inUse.clear();
    for (const queued of this.waitQueue) {
      clearTimeout(queued.timer);
      queued.reject(new Error("[ObjectConnectionPool] Pool destroyed while awaiting connection."));
    }
    this.waitQueue = [];
  }

  public get size(): number {
    return this.inUse.size + this.available.length;
  }

  public get activeCount(): number {
    return this.inUse.size;
  }

  public get availableCount(): number {
    return this.available.length;
  }
}
