import crypto from 'node:crypto';
import { logger } from '@/core/observability/logging/logger.js';

export interface DeduplicationOptions {
  readonly windowMs?: number;
  readonly maxPending?: number;
  readonly maxRecentEntries?: number;
}

/**
 * In-Flight Request Deduplication & Coalescing Queue (SingleFlight Pattern).
 *
 * Prevents identical duplicate requests from hitting AI models or databases simultaneously.
 * Enforces strict User-Partitioned Keys to guarantee User A's response is NEVER delivered to User B.
 * Implements bounded LRU/FIFO eviction and timer-free pruning to prevent memory leaks (CWE-400).
 *
 * Conforms to:
 * - STD-COD-005: Concurrency & Decoupled Execution Queue
 * - STD-COD-007: Clean Code & High Cohesion
 */
export class RequestDeduplicator {
  private readonly inFlight = new Map<string, Promise<any>>();
  private readonly recentResults = new Map<string, { result: any; expiresAt: number }>();
  private readonly windowMs: number;
  private readonly maxPending: number;
  private readonly maxRecentEntries: number;

  constructor(options: DeduplicationOptions = {}) {
    this.windowMs = options.windowMs ?? 3000;
    this.maxPending = options.maxPending ?? 100;
    this.maxRecentEntries = options.maxRecentEntries ?? 500;
  }

  /**
   * Generates a deterministic hash key partitioned by userContext.
   * Ensures User A and User B never collide or coalesce onto each other's responses.
   */
  public generateKey(prefix: string, payload: unknown, userContext = 'anonymous'): string {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return `user:${userContext}:${prefix}:${hash}`;
  }

  /**
   * Executes or coalesces onto an in-flight operation for the specified key.
   * Free of per-request setTimeout handles to eliminate memory leakage under high concurrency.
   */
  public async execute<T>(key: string, task: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // 1. Check recent results cache within deduplication window
    const recent = this.recentResults.get(key);
    if (recent) {
      if (now < recent.expiresAt) {
        logger.debug('DEDUP', `Served recent cached result for key '${key}'`);
        return recent.result as T;
      }
      this.recentResults.delete(key);
    }

    // 2. Coalesce onto in-flight promise if identical task is currently running
    if (this.inFlight.has(key)) {
      logger.info('DEDUP', `Coalescing duplicate concurrent request onto in-flight task for '${key}'`);
      return this.inFlight.get(key) as Promise<T>;
    }

    // 3. Ensure queue capacity bounds
    if (this.inFlight.size >= this.maxPending) {
      logger.warn('DEDUP', `Deduplication queue reached limit (${this.maxPending}). Proceeding without coalescing.`);
      return task();
    }

    // 4. Start execution and store in-flight promise
    const executionPromise = (async () => {
      try {
        const result = await task();
        this.cacheResult(key, result);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, executionPromise);
    return executionPromise;
  }

  /**
   * Bounded cache storage: evicts oldest entries and expired items without event-loop timers.
   */
  private cacheResult(key: string, result: any): void {
    const now = Date.now();
    // Prune expired entries if capacity approaches bound
    if (this.recentResults.size >= this.maxRecentEntries) {
      for (const [k, v] of this.recentResults.entries()) {
        if (now >= v.expiresAt) {
          this.recentResults.delete(k);
        }
      }
      // If still over capacity, evict oldest FIFO key
      if (this.recentResults.size >= this.maxRecentEntries) {
        const oldestKey = this.recentResults.keys().next().value;
        if (oldestKey) this.recentResults.delete(oldestKey);
      }
    }

    this.recentResults.set(key, {
      result,
      expiresAt: now + this.windowMs,
    });
  }

  public getInFlightCount(): number {
    return this.inFlight.size;
  }

  public getRecentCount(): number {
    return this.recentResults.size;
  }

  public clear(): void {
    this.inFlight.clear();
    this.recentResults.clear();
  }
}

export const requestDeduplicator = new RequestDeduplicator();
