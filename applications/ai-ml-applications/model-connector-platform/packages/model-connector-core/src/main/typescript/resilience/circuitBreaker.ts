export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

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
    this.name = "CircuitBreakerOpenException";
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
  private state: CircuitBreakerState = "CLOSED";
  private lastStateTransitionTime: number = Date.now();
  private callResults: boolean[] = [];
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
    return this.getState() === "OPEN";
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new CircuitBreakerOpenException(this.name);
    }
    if (this.state === "HALF_OPEN") {
      this.halfOpenTrialCalls++;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  public recordSuccess(): void {
    if (this.state === "HALF_OPEN" && this.halfOpenTrialCalls >= this.config.permittedNumberOfCallsInHalfOpenState) {
      this.transitionTo("CLOSED");
      return;
    }
    this.addCallResult(true);
  }

  public recordFailure(): void {
    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN");
      return;
    }
    this.addCallResult(false);
    this.evaluateFailureRate();
  }

  private addCallResult(success: boolean): void {
    this.callResults.push(success);
    if (this.callResults.length > this.config.slidingWindowSize) {
      this.callResults.shift();
    }
  }

  private evaluateFailureRate(): void {
    if (this.callResults.length < this.config.minimumNumberOfCalls) return;
    const failures = this.callResults.filter((res) => !res).length;
    const rate = (failures / this.callResults.length) * 100;
    if (rate >= this.config.failureRateThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private checkStateTransition(): void {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastStateTransitionTime;
      if (elapsed >= this.config.waitDurationInOpenStateMs) {
        this.transitionTo("HALF_OPEN");
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    this.state = newState;
    this.lastStateTransitionTime = Date.now();
    this.callResults = [];
    this.halfOpenTrialCalls = 0;
  }
}
