import { logger } from '@/core/logger.js';
import type { ExecutionAttempt, RetryOptions } from '@/types/resilience.js';
import { StuckProcessError } from '@/concurrency/watchdog.js';
import { CircuitBreakerOpenError } from '@/resilience/circuit-breaker.js';
import {
  CIRCUIT_BREAKER_STATES,
  EXECUTION_STATUS_NAMES,
  RETRY_DEFAULTS,
} from '@/constants/index.js';

// ============================================================================
// Specification Pattern for Error Retryability (SOLID: SRP, OCP, LSP)
// ============================================================================

export interface IErrorRetrySpecification {
  isSatisfiedBy(error: unknown): boolean;
  isTerminal(error: unknown): boolean;
}

export class CircuitBreakerErrorSpecification implements IErrorRetrySpecification {
  isSatisfiedBy(error: unknown): boolean {
    return error instanceof CircuitBreakerOpenError;
  }

  isTerminal(error: unknown): boolean {
    return error instanceof CircuitBreakerOpenError;
  }
}

export class StuckProcessErrorSpecification implements IErrorRetrySpecification {
  isSatisfiedBy(error: unknown): boolean {
    return error instanceof StuckProcessError;
  }

  isTerminal(_error: unknown): boolean {
    return false;
  }
}

export class SyntaxValidationErrorSpecification implements IErrorRetrySpecification {
  private static readonly NON_RETRYABLE_PATTERNS = ['schema validation', 'invalid json syntax'];

  isSatisfiedBy(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return SyntaxValidationErrorSpecification.NON_RETRYABLE_PATTERNS.some((p) => msg.includes(p));
  }

  isTerminal(error: unknown): boolean {
    return this.isSatisfiedBy(error);
  }
}

export class CompositeRetrySpecification {
  private static readonly TERMINAL_SPECS: IErrorRetrySpecification[] = [
    new CircuitBreakerErrorSpecification(),
    new SyntaxValidationErrorSpecification(),
  ];

  static isRetryable(error: unknown): boolean {
    const isTerminal = this.TERMINAL_SPECS.some((spec) => spec.isTerminal(error));
    const retryabilityMap: Record<string, boolean> = {
      true: false,
      false: true,
    };
    return retryabilityMap[String(isTerminal)] ?? false;
  }
}

// ============================================================================
// Backoff Delay Calculator (Strategy Pattern)
// ============================================================================

export interface IBackoffStrategy {
  calculate(attempt: number, options: RetryOptions): number;
}

export class ExponentialBackoffWithJitterStrategy implements IBackoffStrategy {
  calculate(attempt: number, options: RetryOptions): number {
    const base = options.initialDelayMs * Math.pow(options.backoffFactor, attempt - 1);
    const capped = Math.min(base, options.maxDelayMs);

    const jitterCalculators: Record<string, () => number> = {
      true: () => {
        const jitterAmount = Math.random() * RETRY_DEFAULTS.JITTER_FACTOR * capped;
        return Math.round(capped + jitterAmount);
      },
      false: () => Math.round(capped),
    };

    const calculator = jitterCalculators[String(options.jitter)] ?? jitterCalculators.false;
    return calculator();
  }
}

// ============================================================================
// Resilient Retry Execution Handler
// ============================================================================

export class RetryHandler {
  private options: RetryOptions;
  private backoffStrategy: IBackoffStrategy;

  constructor(options?: RetryOptions, backoffStrategy?: IBackoffStrategy) {
    this.options = options ?? {
      maxRetries: RETRY_DEFAULTS.MAX_RETRIES,
      initialDelayMs: RETRY_DEFAULTS.INITIAL_DELAY_MS,
      maxDelayMs: RETRY_DEFAULTS.MAX_DELAY_MS,
      backoffFactor: RETRY_DEFAULTS.BACKOFF_FACTOR,
      jitter: RETRY_DEFAULTS.JITTER,
    };
    this.backoffStrategy = backoffStrategy ?? new ExponentialBackoffWithJitterStrategy();
  }

  isRetryable(error: unknown): boolean {
    return CompositeRetrySpecification.isRetryable(error);
  }

  computeDelayMs(attemptNumber: number): number {
    return this.backoffStrategy.calculate(attemptNumber, this.options);
  }

  async executeWithRetry<T>(
    operationName: string,
    operation: (attempt: number) => Promise<T>,
    customMaxRetries?: number
  ): Promise<{ result: T; attempts: ExecutionAttempt[]; totalRetries: number }> {
    const maxRetriesCount = customMaxRetries ?? this.options.maxRetries;
    const maxAttempts = maxRetriesCount + 1;
    const attemptsHistory: ExecutionAttempt[] = [];

    return this.executeAttemptLoop(operationName, operation, 1, maxAttempts, attemptsHistory);
  }

  private async executeAttemptLoop<T>(
    operationName: string,
    operation: (attempt: number) => Promise<T>,
    attempt: number,
    maxAttempts: number,
    history: ExecutionAttempt[]
  ): Promise<{ result: T; attempts: ExecutionAttempt[]; totalRetries: number }> {
    const attemptStart = Date.now();

    const isRetry = attempt > 1;
    const logActions: Record<string, () => void> = {
      true: () => logger.info(`Retrying '${operationName}' (Attempt ${attempt}/${maxAttempts})...`),
      false: () => {},
    };
    logActions[String(isRetry)]();

    try {
      const result = await operation(attempt);
      history.push({
        attemptNumber: attempt,
        startedAt: new Date(attemptStart).toISOString(),
        durationMs: Date.now() - attemptStart,
        status: EXECUTION_STATUS_NAMES.SUCCESS,
        circuitBreakerState: CIRCUIT_BREAKER_STATES.CLOSED,
      });

      return {
        result,
        attempts: history,
        totalRetries: attempt - 1,
      };
    } catch (err) {
      const duration = Date.now() - attemptStart;
      const isStuck = err instanceof StuckProcessError;

      const statusMap: Record<string, 'STUCK_KILLED' | 'FAILED'> = {
        true: 'STUCK_KILLED',
        false: 'FAILED',
      };

      const cbStateMap: Record<string, 'OPEN' | 'CLOSED'> = {
        true: 'OPEN',
        false: 'CLOSED',
      };

      history.push({
        attemptNumber: attempt,
        startedAt: new Date(attemptStart).toISOString(),
        durationMs: duration,
        status: statusMap[String(isStuck)] ?? 'FAILED',
        error: err instanceof Error ? err.message : String(err),
        circuitBreakerState: cbStateMap[String(err instanceof CircuitBreakerOpenError)] ?? 'CLOSED',
      });

      const isExhausted = attempt >= maxAttempts;
      const canRetry = this.isRetryable(err);
      const shouldAbort = isExhausted || !canRetry;

      const abortActions: Record<string, () => Promise<never>> = {
        true: async () => {
          logger.error(
            `Operation '${operationName}' exhausted retries (Attempt ${attempt}/${maxAttempts}). Reason: ${err instanceof Error ? err.message : String(err)}`
          );
          throw err;
        },
        false: async () => {
          const delay = this.computeDelayMs(attempt);
          logger.warn(
            `Operation '${operationName}' failed attempt ${attempt}. Waiting ${delay}ms before retry...`,
            { error: err instanceof Error ? err.message : String(err) }
          );
          await new Promise((r) => setTimeout(r, delay));
          throw new Error('ContinueNextAttempt');
        },
      };

      const action = abortActions[String(shouldAbort)] ?? abortActions.true;
      try {
        await action();
      } catch (flowControlErr) {
        const isLoopSignal = (flowControlErr as Error).message === 'ContinueNextAttempt';
        const loopActions: Record<string, () => Promise<{ result: T; attempts: ExecutionAttempt[]; totalRetries: number }>> = {
          true: () => this.executeAttemptLoop(operationName, operation, attempt + 1, maxAttempts, history),
          false: () => { throw flowControlErr; },
        };
        return (loopActions[String(isLoopSignal)] ?? loopActions.false)();
      }

      throw new Error(`Unexpected termination for '${operationName}'`);
    }
  }
}
