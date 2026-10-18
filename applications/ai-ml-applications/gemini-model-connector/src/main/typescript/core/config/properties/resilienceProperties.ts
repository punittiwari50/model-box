import type { Environment } from '@/core/config/environment.js';

/**
 * Strongly-typed configuration properties for resilience and fault tolerance.
 * Encapsulates Resilience parameters (CircuitBreaker, RateLimiter, Bulkhead, Retry).
 */
export class ResilienceProperties {
  public readonly failureRateThreshold: number;
  public readonly waitDurationInOpenStateMs: number;
  public readonly ringBufferSize: number;
  public readonly rateLimitRps: number;
  public readonly bulkheadMaxConcurrent: number;

  constructor(env: Environment) {
    this.failureRateThreshold = env.getPropertyAsNumber('resilience.circuitbreaker.failureRateThreshold', 50);
    this.waitDurationInOpenStateMs = env.getPropertyAsNumber(
      'resilience.circuitbreaker.waitDurationInOpenStateMs',
      10000
    );
    this.ringBufferSize = env.getPropertyAsNumber('resilience.circuitbreaker.ringBufferSize', 10);
    this.rateLimitRps = env.getPropertyAsNumber('resilience.ratelimiter.limitForPeriod', 100);
    this.bulkheadMaxConcurrent = env.getPropertyAsNumber('resilience.bulkhead.maxConcurrentCalls', 50);
  }
}
