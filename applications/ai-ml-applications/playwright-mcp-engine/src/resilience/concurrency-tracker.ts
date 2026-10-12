import { logger } from '@/core/logger.js';
import type { ConcurrencyMetricsSnapshot } from '@/types/concurrency.js';
import type { ExecutionStatus, WorkflowExecutionResponse } from '@/types/workflow.js';
import type { CircuitBreakerState } from '@/types/resilience.js';
import type { BrowserPool } from '@/concurrency/browser-pool.js';
import type { CircuitBreakerRegistry } from '@/resilience/circuit-breaker.js';
import { CIRCUIT_BREAKER_STATES } from '@/constants/index.js';

export class ConcurrencyTracker {
  private pool: BrowserPool;
  private circuitBreakers: CircuitBreakerRegistry;
  private peakConcurrency = 0;
  private totalTasksProcessed = 0;
  private totalTasksSucceeded = 0;
  private totalTasksFailed = 0;
  private totalWaitTimeMs = 0;
  private totalQueuedTasksCount = 0;

  constructor(pool: BrowserPool, circuitBreakers: CircuitBreakerRegistry) {
    this.pool = pool;
    this.circuitBreakers = circuitBreakers;
  }

  recordTaskStart(): { activeAtStart: number; queueWaitStart: number } {
    const active = this.pool.getActiveConcurrency();
    this.peakConcurrency = Math.max(this.peakConcurrency, active);
    return {
      activeAtStart: active,
      queueWaitStart: Date.now(),
    };
  }

  recordTaskCompletion(waitDurationMs: number, success: boolean): void {
    this.totalTasksProcessed++;

    const outcomeUpdaters: Record<string, () => void> = {
      true: () => this.totalTasksSucceeded++,
      false: () => this.totalTasksFailed++,
    };
    (outcomeUpdaters[String(success)] ?? outcomeUpdaters.false)();

    const isWaitObserved = waitDurationMs > 0;
    const waitUpdaters: Record<string, () => void> = {
      true: () => {
        this.totalWaitTimeMs += waitDurationMs;
        this.totalQueuedTasksCount++;
      },
      false: () => {},
    };
    (waitUpdaters[String(isWaitObserved)] ?? waitUpdaters.false)();
  }

  getMetricsSnapshot(): ConcurrencyMetricsSnapshot {
    const active = this.pool.getActiveConcurrency();
    const max = this.pool.getMaxConcurrency();
    const queueLen = this.pool.getQueueLength();
    const hasQueuedTasks = this.totalQueuedTasksCount > 0;

    const avgWaitResolvers: Record<string, () => number> = {
      true: () => Math.round(this.totalWaitTimeMs / this.totalQueuedTasksCount),
      false: () => 0,
    };
    const averageQueueWaitMs = (avgWaitResolvers[String(hasQueuedTasks)] ?? avgWaitResolvers.false)();

    return {
      timestamp: new Date().toISOString(),
      maxConcurrency: max,
      currentActive: active,
      queueLength: queueLen,
      peakConcurrency: this.peakConcurrency,
      totalTasksProcessed: this.totalTasksProcessed,
      totalTasksSucceeded: this.totalTasksSucceeded,
      totalTasksFailed: this.totalTasksFailed,
      totalStuckProcessesKilled: this.pool.getTotalStuckKills(),
      averageQueueWaitMs,
      workerSlots: this.pool.getSlotsSnapshot(),
    };
  }

  markResponse(params: {
    workflowId: string;
    workflowName: string;
    status: ExecutionStatus;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    activeAtStart: number;
    queueWaitDurationMs: number;
    slotAssigned: number;
    retriesAttempted: number;
    circuitBreakerDomain?: string;
    stuckProcessKilled: boolean;
    stuckDetails?: {
      stepId?: string;
      pidKilled?: number;
      durationBeforeKillMs?: number;
      reason?: string;
    };
    networkAuthSummary: WorkflowExecutionResponse['networkAuthSummary'];
    extractedOutputs: Record<string, unknown>;
    stepResults: WorkflowExecutionResponse['stepResults'];
    error?: string;
  }): WorkflowExecutionResponse {
    const hasDomain = Boolean(params.circuitBreakerDomain);
    const cbStateResolvers: Record<string, () => CircuitBreakerState> = {
      true: () => this.circuitBreakers.getStatus(params.circuitBreakerDomain!).state,
      false: () => CIRCUIT_BREAKER_STATES.CLOSED,
    };
    const cbState = (cbStateResolvers[String(hasDomain)] ?? cbStateResolvers.false)();

    const activeAtEnd = this.pool.getActiveConcurrency();

    logger.info(
      `Marked response for '${params.workflowId}': Status=${params.status}, Retries=${params.retriesAttempted}, Breaker=${cbState}, StuckKill=${params.stuckProcessKilled}, AuthEndpoints=${params.networkAuthSummary.authRequiredCount}`
    );

    return {
      workflowId: params.workflowId,
      workflowName: params.workflowName,
      status: params.status,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      durationMs: params.durationMs,
      concurrencyMetrics: {
        activeWorkersAtStart: params.activeAtStart,
        activeWorkersAtEnd: activeAtEnd,
        peakObservedConcurrency: this.peakConcurrency,
        queuedWaitDurationMs: params.queueWaitDurationMs,
        slotAssigned: params.slotAssigned,
      },
      resilienceMetrics: {
        retriesAttempted: params.retriesAttempted,
        circuitBreakerState: cbState,
        stuckProcessKilled: params.stuckProcessKilled,
        stuckDetails: params.stuckDetails,
      },
      networkAuthSummary: params.networkAuthSummary,
      extractedOutputs: params.extractedOutputs,
      stepResults: params.stepResults,
      error: params.error,
    };
  }
}
