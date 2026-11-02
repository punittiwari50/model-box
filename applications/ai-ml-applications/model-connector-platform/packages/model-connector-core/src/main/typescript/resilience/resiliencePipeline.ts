import { CircuitBreaker } from "@/resilience/circuitBreaker.js";
import { RetryPolicy } from "@/resilience/retryPolicy.js";
import { RateLimiter } from "@/resilience/rateLimiter.js";
import { Bulkhead } from "@/resilience/bulkhead.js";

export interface ResiliencePipelineConfig {
  readonly circuitBreaker?: CircuitBreaker;
  readonly retryPolicy?: RetryPolicy;
  readonly rateLimiter?: RateLimiter;
  readonly bulkhead?: Bulkhead;
}

export class ResiliencePipeline {
  constructor(private readonly config: ResiliencePipelineConfig) {}

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    const runRateLimited = async (): Promise<T> => {
      if (this.config.rateLimiter) {
        this.config.rateLimiter.acquire(1);
      }
      return action();
    };

    const runBulkheaded = async (): Promise<T> => {
      if (this.config.bulkhead) {
        return this.config.bulkhead.execute(runRateLimited);
      }
      return runRateLimited();
    };

    const runRetried = async (): Promise<T> => {
      if (this.config.retryPolicy) {
        return this.config.retryPolicy.execute(() => runBulkheaded());
      }
      return runBulkheaded();
    };

    if (this.config.circuitBreaker) {
      return this.config.circuitBreaker.execute(runRetried);
    }
    return runRetried();
  }
}
