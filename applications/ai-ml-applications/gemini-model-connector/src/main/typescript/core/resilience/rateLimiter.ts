/**
 * Resilience4j Rate Limiter Implementation.
 * Enforces request throughput constraints with token bucket / sliding interval.
 */

export interface RateLimiterConfig {
  readonly limitForPeriod: number;
  readonly limitRefreshPeriodMs: number;
  readonly timeoutDurationMs: number;
}

export class RequestNotPermittedException extends Error {
  constructor(name: string) {
    super(
      `RateLimiter '${name}' does not permit further execution: period limit exceeded.`,
    );
    this.name = "RequestNotPermittedException";
  }
}

export class RateLimiter {
  private availableTokens: number;
  private lastRefreshedMs: number;
  private readonly config: RateLimiterConfig;

  constructor(
    public readonly name: string,
    config: Partial<RateLimiterConfig> = {},
  ) {
    this.config = {
      limitForPeriod: config.limitForPeriod ?? 50,
      limitRefreshPeriodMs: config.limitRefreshPeriodMs ?? 1000,
      timeoutDurationMs: config.timeoutDurationMs ?? 500,
    };
    this.availableTokens = this.config.limitForPeriod;
    this.lastRefreshedMs = Date.now();
  }

  private refreshTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefreshedMs;
    if (elapsed >= this.config.limitRefreshPeriodMs) {
      this.availableTokens = this.config.limitForPeriod;
      this.lastRefreshedMs = now;
    }
  }

  public async acquirePermission(): Promise<boolean> {
    this.refreshTokens();
    if (this.availableTokens > 0) {
      this.availableTokens--;
      return true;
    }

    const waitStart = Date.now();
    while (Date.now() - waitStart < this.config.timeoutDurationMs) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      this.refreshTokens();
      if (this.availableTokens > 0) {
        this.availableTokens--;
        return true;
      }
    }

    throw new RequestNotPermittedException(this.name);
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    await this.acquirePermission();
    return action();
  }
}
