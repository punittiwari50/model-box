/**
 * Resilience4j Bulkhead Implementation.
 * Controls maximum concurrent executions to prevent downstream resource starvation.
 */

export interface BulkheadConfig {
  readonly maxConcurrentCalls: number;
  readonly maxWaitDurationMs: number;
}

export class BulkheadFullException extends Error {
  constructor(name: string) {
    super(`Bulkhead '${name}' is full: max concurrent calls reached.`);
    this.name = 'BulkheadFullException';
  }
}

export class Bulkhead {
  private activeCalls = 0;
  private readonly config: BulkheadConfig;

  constructor(
    public readonly name: string,
    config: Partial<BulkheadConfig> = {}
  ) {
    this.config = {
      maxConcurrentCalls: config.maxConcurrentCalls ?? 25,
      maxWaitDurationMs: config.maxWaitDurationMs ?? 1000,
    };
  }

  public async acquire(): Promise<void> {
    if (this.activeCalls < this.config.maxConcurrentCalls) {
      this.activeCalls++;
      return;
    }

    const start = Date.now();
    while (Date.now() - start < this.config.maxWaitDurationMs) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (this.activeCalls < this.config.maxConcurrentCalls) {
        this.activeCalls++;
        return;
      }
    }

    throw new BulkheadFullException(this.name);
  }

  public release(): void {
    if (this.activeCalls > 0) {
      this.activeCalls--;
    }
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await action();
    } finally {
      this.release();
    }
  }
}
