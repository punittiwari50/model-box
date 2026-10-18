import { CircuitBreaker } from '@/core/resilience/circuitBreaker.js';
import { Bulkhead } from '@/core/resilience/bulkhead.js';
import { RateLimiter } from '@/core/resilience/rateLimiter.js';
import { RetryPolicy } from '@/core/resilience/retryPolicy.js';
import { RequestDeduplicator } from '@/core/resilience/requestDeduplicator.js';

export interface ResiliencePipelineConfig {
  circuitBreaker?: CircuitBreaker;
  bulkhead?: Bulkhead;
  rateLimiter?: RateLimiter;
  retryPolicy?: RetryPolicy;
  deduplicator?: RequestDeduplicator;
}

/**
 * Enterprise Unified Resilience Pipeline.
 * Integrates CircuitBreaker, Bulkhead, RateLimiter, RetryPolicy, and RequestDeduplicator
 * into a single composable execution chain (Chain of Responsibility / Decorator Pattern).
 *
 * Answering Directive #1:
 * - CircuitBreaker protects downstream services from cascading outages by failing fast when errors spike.
 * - RequestDeduplicator prevents "Thundering Herd" / duplicate in-flight executions for identical requests.
 * - Both are complementary layers in enterprise resilience engineering.
 */
export class ResiliencePipeline {
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly bulkhead?: Bulkhead;
  private readonly rateLimiter?: RateLimiter;
  private readonly retryPolicy?: RetryPolicy;
  private readonly deduplicator?: RequestDeduplicator;

  constructor(config: ResiliencePipelineConfig = {}) {
    this.circuitBreaker = config.circuitBreaker;
    this.bulkhead = config.bulkhead;
    this.rateLimiter = config.rateLimiter;
    this.retryPolicy = config.retryPolicy;
    this.deduplicator = config.deduplicator;
  }

  public async execute<T>(
    _operationKey: string,
    action: () => Promise<T>,
    dedupKey?: string
  ): Promise<T> {
    const wrappedAction = async (): Promise<T> => {
      // 1. Rate Limiter stage
      if (this.rateLimiter) {
        await this.rateLimiter.acquirePermission();
      }

      // 2. Circuit Breaker & Bulkhead stage
      const runWithBreakerAndBulkhead = async () => {
        if (this.bulkhead) {
          return this.bulkhead.execute(async () => {
            if (this.circuitBreaker) {
              return this.circuitBreaker.execute(action);
            }
            return action();
          });
        }
        if (this.circuitBreaker) {
          return this.circuitBreaker.execute(action);
        }
        return action();
      };

      // 3. Retry Policy stage
      if (this.retryPolicy) {
        return this.retryPolicy.execute(runWithBreakerAndBulkhead);
      }
      return runWithBreakerAndBulkhead();
    };

    // 4. Request Deduplication stage (Coalescing duplicate concurrent operations)
    if (this.deduplicator && dedupKey) {
      return this.deduplicator.execute(dedupKey, wrappedAction);
    }

    return wrappedAction();
  }
}
