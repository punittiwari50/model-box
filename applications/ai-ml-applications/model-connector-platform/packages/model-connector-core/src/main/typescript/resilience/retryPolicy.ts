import { delay } from "@/utils/concurrency/concurrencyUtils.js";

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly initialBackoffMs: number;
  readonly maxBackoffMs: number;
  readonly backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = Object.freeze({
  maxAttempts: 3,
  initialBackoffMs: 500,
  maxBackoffMs: 5000,
  backoffMultiplier: 2,
});

export class RetryPolicy {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = Object.freeze({ ...DEFAULT_RETRY_CONFIG, ...config });
  }

  public async execute<T>(action: (attempt: number) => Promise<T>): Promise<T> {
    let lastError: unknown;
    let currentBackoff = this.config.initialBackoffMs;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await action(attempt);
      } catch (err) {
        lastError = err;
        if (attempt === this.config.maxAttempts) break;
        await delay(currentBackoff);
        currentBackoff = Math.min(
          currentBackoff * this.config.backoffMultiplier,
          this.config.maxBackoffMs
        );
      }
    }
    throw lastError;
  }
}
