import { logger } from '@/core/observability/logging/logger.js';
import { ModelFamily } from '@/domain/constants/index.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  readonly failureRateThreshold: number; // percentage (0-100)
  readonly waitDurationInOpenStateMs: number;
  readonly slidingWindowSize: number;
  readonly minimumNumberOfCalls: number;
  readonly permittedNumberOfCallsInHalfOpenState: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = Object.freeze({
  failureRateThreshold: 50,
  waitDurationInOpenStateMs: 8000,
  slidingWindowSize: 10,
  minimumNumberOfCalls: 4,
  permittedNumberOfCallsInHalfOpenState: 2,
});

export class CircuitBreakerOpenException extends Error {
  constructor(public readonly circuitName: string) {
    super(`[CircuitBreaker:${circuitName}] Circuit is OPEN. Execution blocked to prevent cascading failure.`);
    this.name = 'CircuitBreakerOpenException';
  }
}

/**
 * Resilience4j-style Circuit Breaker.
 * Conforms to:
 * - STD-COD-005: State Pattern & Resilient Distributed Architecture
 * - STD-COD-007: Clean Code & Exception Governance
 */
export class CircuitBreaker {
  public readonly name: string;
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState = 'CLOSED';
  private lastStateTransitionTime: number = Date.now();
  private callResults: boolean[] = []; // true = success, false = failure
  private halfOpenTrialCalls = 0;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = Object.freeze({ ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config });
  }

  public getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  public isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  /**
   * Executes a protected asynchronous action within the circuit breaker boundary.
   * If circuit is OPEN, immediately executes the fallback if provided or throws CircuitBreakerOpenException.
   */
  public async execute<T>(action: () => Promise<T>, fallback?: (err: Error) => Promise<T> | T): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      const openError = new CircuitBreakerOpenException(this.name);
      if (fallback) {
        logger.warn('CIRCUIT_BREAKER', `Circuit '${this.name}' is OPEN. Invoking fallback mechanism.`);
        return fallback(openError);
      }
      throw openError;
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenTrialCalls++;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (err: any) {
      this.recordFailure();
      if (fallback) {
        logger.warn('CIRCUIT_BREAKER', `Action in '${this.name}' failed (${err.message}). Invoking fallback.`);
        return fallback(err);
      }
      throw err;
    }
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenTrialCalls >= this.config.permittedNumberOfCallsInHalfOpenState) {
        this.transitionTo('CLOSED');
      }
      return;
    }

    this.callResults.push(true);
    if (this.callResults.length > this.config.slidingWindowSize) {
      this.callResults.shift();
    }
  }

  private recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }

    this.callResults.push(false);
    if (this.callResults.length > this.config.slidingWindowSize) {
      this.callResults.shift();
    }

    if (this.callResults.length >= this.config.minimumNumberOfCalls) {
      const failures = this.callResults.filter((r) => !r).length;
      const failureRate = (failures / this.callResults.length) * 100;
      if (failureRate >= this.config.failureRateThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  private checkStateTransition(): void {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastStateTransitionTime;
      if (elapsed >= this.config.waitDurationInOpenStateMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateTransitionTime = Date.now();
    this.callResults = [];
    this.halfOpenTrialCalls = 0;
    logger.info('CIRCUIT_BREAKER', `Circuit '${this.name}' transitioned from ${oldState} -> ${newState}`);
  }

  public getMetrics() {
    return {
      name: this.name,
      state: this.getState(),
      totalCallsTracked: this.callResults.length,
      failures: this.callResults.filter((r) => !r).length,
    };
  }
}

/**
 * Circuit Breaker Registry mapping instances (database, gemini, claude, codex).
 * Implements hierarchical inheritance from default configuration.
 */
export class CircuitBreakerRegistry {
  private readonly instances = new Map<string, CircuitBreaker>();

  constructor() {
    // Database instance
    this.register('database', {
      failureRateThreshold: 40,
      waitDurationInOpenStateMs: 5000,
      slidingWindowSize: 6,
      minimumNumberOfCalls: 3,
    });
    // AI Model instances
    this.register(ModelFamily.GEMINI, { failureRateThreshold: 50, waitDurationInOpenStateMs: 8000 });
    this.register(ModelFamily.CLAUDE, { failureRateThreshold: 40, waitDurationInOpenStateMs: 10000 });
    this.register(ModelFamily.CODEX, { failureRateThreshold: 40, waitDurationInOpenStateMs: 8000 });
    this.register(ModelFamily.COPILOT, { failureRateThreshold: 40, waitDurationInOpenStateMs: 8000 });
    this.register(ModelFamily.CURSOR, { failureRateThreshold: 40, waitDurationInOpenStateMs: 8000 });
    this.register(ModelFamily.OLLAMA, { failureRateThreshold: 50, waitDurationInOpenStateMs: 5000 });
    this.register(ModelFamily.GROK, { failureRateThreshold: 40, waitDurationInOpenStateMs: 8000 });
  }

  public register(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const cb = new CircuitBreaker(name, config);
    this.instances.set(name, cb);
    return cb;
  }

  public get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.instances.has(name)) {
      this.register(name, config);
    }
    return this.instances.get(name)!;
  }

  public getAll(): readonly CircuitBreaker[] {
    return Array.from(this.instances.values());
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
