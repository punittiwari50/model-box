export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // e.g. 3 consecutive failures
  resetTimeoutMs: number; // e.g. 30000ms to transition to HALF_OPEN
  halfOpenMaxProbes: number; // e.g. 2 successful probes to close
  monitoredErrors?: string[];
}

export interface CircuitBreakerStatus {
  domain: string;
  state: CircuitBreakerState;
  consecutiveFailures: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRejected: number;
}

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
}

export interface ExecutionAttempt {
  attemptNumber: number;
  startedAt: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'STUCK_KILLED';
  error?: string;
  circuitBreakerState: CircuitBreakerState;
}
