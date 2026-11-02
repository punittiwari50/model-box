export class RateLimiterExceededException extends Error {
  constructor(public readonly limiterName: string) {
    super(`[RateLimiter:${limiterName}] Request rate limit exceeded.`);
    this.name = "RateLimiterExceededException";
  }
}

export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    public readonly name: string,
    public readonly maxTokens: number = 50,
    public readonly refillRatePerSecond: number = 50
  ) {
    this.tokens = maxTokens;
    this.lastRefillTime = Date.now();
  }

  public tryAcquire(requested = 1): boolean {
    this.refill();
    if (this.tokens >= requested) {
      this.tokens -= requested;
      return true;
    }
    return false;
  }

  public acquire(requested = 1): void {
    if (!this.tryAcquire(requested)) {
      throw new RateLimiterExceededException(this.name);
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const newTokens = elapsedSeconds * this.refillRatePerSecond;
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefillTime = now;
    }
  }
}
