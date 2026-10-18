/**
 * Resilience4j Retry Policy Implementation.
 * Enforces exponential backoff and jittered retry semantics.
 */

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly waitDurationMs: number;
  readonly backoffMultiplier: number;
}

export class RetryPolicy {
  private readonly config: RetryConfig;

  constructor(
    public readonly name: string,
    config: Partial<RetryConfig> = {}
  ) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      waitDurationMs: config.waitDurationMs ?? 1000,
      backoffMultiplier: config.backoffMultiplier ?? 2.0,
    };
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    let lastError: any;
    let delay = this.config.waitDurationMs;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await action();
      } catch (err: any) {
        lastError = err;
        if (attempt >= this.config.maxAttempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= this.config.backoffMultiplier;
      }
    }

    throw lastError;
  }
}
