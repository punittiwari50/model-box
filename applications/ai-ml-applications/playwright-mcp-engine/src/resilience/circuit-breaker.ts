import { logger } from '@/core/logger.js';
import type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStatus } from '@/types/resilience.js';
import { CIRCUIT_BREAKER_DEFAULTS, CIRCUIT_BREAKER_STATES } from '@/constants/index.js';

export class CircuitBreakerOpenError extends Error {
  domain: string;
  resetInMs: number;

  constructor(domain: string, resetInMs: number) {
    super(
      `Circuit breaker is OPEN for domain '${domain}'. Fast-failing execution. Resets in ${Math.round(resetInMs / 1000)}s.`
    );
    this.name = 'CircuitBreakerOpenError';
    this.domain = domain;
    this.resetInMs = resetInMs;
  }
}

// ============================================================================
// State Pattern for Circuit Breaker (SOLID: SRP, OCP, LSP)
// ============================================================================

export interface ICircuitContext {
  readonly domain: string;
  readonly config: CircuitBreakerConfig;
  consecutiveFailures: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  halfOpenSuccessCount: number;
  totalRejected: number;
  transitionTo(state: ICircuitState): void;
}

export interface ICircuitState {
  readonly name: CircuitBreakerState;
  checkAllowed(context: ICircuitContext): CircuitBreakerState;
  onSuccess(context: ICircuitContext): void;
  onFailure(context: ICircuitContext, error?: unknown): void;
}

export class ClosedCircuitState implements ICircuitState {
  readonly name = CIRCUIT_BREAKER_STATES.CLOSED;

  checkAllowed(_context: ICircuitContext): CircuitBreakerState {
    return this.name;
  }

  onSuccess(context: ICircuitContext): void {
    context.consecutiveFailures = 0;
  }

  onFailure(context: ICircuitContext, _error?: unknown): void {
    const isThresholdReached = context.consecutiveFailures >= context.config.failureThreshold;
    const failureActions: Record<string, () => void> = {
      true: () => {
        logger.error(
          `CircuitBreaker tripped OPEN for domain '${context.domain}' after ${context.consecutiveFailures} consecutive failures!`
        );
        context.transitionTo(new OpenCircuitState());
      },
      false: () => {},
    };
    const action = failureActions[String(isThresholdReached)] ?? failureActions.false;
    action();
  }
}

export class HalfOpenCircuitState implements ICircuitState {
  readonly name = CIRCUIT_BREAKER_STATES.HALF_OPEN;

  checkAllowed(_context: ICircuitContext): CircuitBreakerState {
    return this.name;
  }

  onSuccess(context: ICircuitContext): void {
    context.halfOpenSuccessCount++;
    const isRecovered = context.halfOpenSuccessCount >= context.config.halfOpenMaxProbes;

    const recoveryActions: Record<string, () => void> = {
      true: () => {
        logger.info(
          `CircuitBreaker for '${context.domain}' recovered! State transitioned from HALF_OPEN to CLOSED`
        );
        context.consecutiveFailures = 0;
        context.transitionTo(new ClosedCircuitState());
      },
      false: () => {},
    };
    const action = recoveryActions[String(isRecovered)] ?? recoveryActions.false;
    action();
  }

  onFailure(context: ICircuitContext, _error?: unknown): void {
    logger.error(`CircuitBreaker probe failed for '${context.domain}'! Returning to OPEN state`);
    context.transitionTo(new OpenCircuitState());
  }
}

export class OpenCircuitState implements ICircuitState {
  readonly name = CIRCUIT_BREAKER_STATES.OPEN;

  checkAllowed(context: ICircuitContext): CircuitBreakerState {
    const now = Date.now();
    const elapsedSinceFailure = context.lastFailureTime ? now - context.lastFailureTime : 0;
    const isResetReady = elapsedSinceFailure >= context.config.resetTimeoutMs;

    const checkActions: Record<string, () => CircuitBreakerState> = {
      true: () => {
        logger.info(
          `CircuitBreaker for '${context.domain}' transitioning from OPEN to HALF_OPEN (Trial probe enabled)`
        );
        context.halfOpenSuccessCount = 0;
        context.transitionTo(new HalfOpenCircuitState());
        return CIRCUIT_BREAKER_STATES.HALF_OPEN;
      },
      false: () => {
        context.totalRejected++;
        const resetInMs = context.config.resetTimeoutMs - elapsedSinceFailure;
        logger.warn(
          `CircuitBreaker rejected request for '${context.domain}' (Breaker is OPEN, reset in ${resetInMs}ms)`
        );
        throw new CircuitBreakerOpenError(context.domain, resetInMs);
      },
    };

    const action = checkActions[String(isResetReady)] ?? checkActions.false;
    return action();
  }

  onSuccess(_context: ICircuitContext): void {}

  onFailure(_context: ICircuitContext, _error?: unknown): void {}
}

class DomainCircuitHolder implements ICircuitContext {
  state: ICircuitState = new ClosedCircuitState();
  consecutiveFailures = 0;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  halfOpenSuccessCount = 0;
  totalRejected = 0;

  constructor(
    readonly domain: string,
    readonly config: CircuitBreakerConfig
  ) {}

  transitionTo(state: ICircuitState): void {
    this.state = state;
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

export class CircuitBreakerRegistry {
  private domains = new Map<string, DomainCircuitHolder>();
  private config: CircuitBreakerConfig;

  constructor(config?: CircuitBreakerConfig) {
    this.config = config ?? {
      failureThreshold: CIRCUIT_BREAKER_DEFAULTS.FAILURE_THRESHOLD,
      resetTimeoutMs: CIRCUIT_BREAKER_DEFAULTS.RESET_TIMEOUT_MS,
      halfOpenMaxProbes: CIRCUIT_BREAKER_DEFAULTS.HALF_OPEN_MAX_PROBES,
    };
  }

  private getDomainContext(domain: string): DomainCircuitHolder {
    const existing = this.domains.get(domain);
    const hasExisting = Boolean(existing);

    const resolvers: Record<string, () => DomainCircuitHolder> = {
      true: () => existing!,
      false: () => {
        const holder = new DomainCircuitHolder(domain, this.config);
        this.domains.set(domain, holder);
        return holder;
      },
    };

    return (resolvers[String(hasExisting)] ?? resolvers.false)();
  }

  checkAllowed(domain?: string): CircuitBreakerState {
    const hasDomain = Boolean(domain);
    const domainActions: Record<string, () => CircuitBreakerState> = {
      true: () => {
        const holder = this.getDomainContext(domain!);
        return holder.state.checkAllowed(holder);
      },
      false: () => CIRCUIT_BREAKER_STATES.CLOSED,
    };

    return (domainActions[String(hasDomain)] ?? domainActions.false)();
  }

  recordSuccess(domain?: string): void {
    const hasDomain = Boolean(domain);
    const successActions: Record<string, () => void> = {
      true: () => {
        const holder = this.getDomainContext(domain!);
        holder.lastSuccessTime = Date.now();
        holder.state.onSuccess(holder);
      },
      false: () => {},
    };

    const action = successActions[String(hasDomain)] ?? successActions.false;
    action();
  }

  recordFailure(domain?: string, error?: unknown): void {
    const hasDomain = Boolean(domain);
    const failureActions: Record<string, () => void> = {
      true: () => {
        const holder = this.getDomainContext(domain!);
        holder.lastFailureTime = Date.now();
        holder.consecutiveFailures++;

        logger.warn(
          `CircuitBreaker recorded failure #${holder.consecutiveFailures} for domain '${domain}'`,
          { error: error instanceof Error ? error.message : String(error) }
        );

        holder.state.onFailure(holder, error);
      },
      false: () => {},
    };

    const action = failureActions[String(hasDomain)] ?? failureActions.false;
    action();
  }

  getStatus(domain: string): CircuitBreakerStatus {
    const holder = this.getDomainContext(domain);
    return {
      domain,
      state: holder.state.name,
      consecutiveFailures: holder.consecutiveFailures,
      lastFailureTime: holder.lastFailureTime,
      lastSuccessTime: holder.lastSuccessTime,
      totalRejected: holder.totalRejected,
    };
  }

  getAllStatuses(): CircuitBreakerStatus[] {
    return Array.from(this.domains.entries()).map(([domain, holder]) => ({
      domain,
      state: holder.state.name,
      consecutiveFailures: holder.consecutiveFailures,
      lastFailureTime: holder.lastFailureTime,
      lastSuccessTime: holder.lastSuccessTime,
      totalRejected: holder.totalRejected,
    }));
  }

  reset(domain?: string): void {
    const hasDomain = Boolean(domain);
    const resetActions: Record<string, () => void> = {
      true: () => {
        this.domains.delete(domain!);
      },
      false: () => {
        this.domains.clear();
      },
    };

    const action = resetActions[String(hasDomain)] ?? resetActions.false;
    action();
  }
}
