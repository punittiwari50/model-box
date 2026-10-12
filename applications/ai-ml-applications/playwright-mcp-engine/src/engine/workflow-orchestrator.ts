import { logger } from '@/core/logger.js';
import type {
  ExecutionStatus,
  StepExecutionResult,
  WorkflowExecutionResponse,
} from '@/types/workflow.js';
import type { BrowserPool } from '@/concurrency/browser-pool.js';
import { StuckProcessError, TaskWatchdog } from '@/concurrency/watchdog.js';
import { CircuitBreakerOpenError, type CircuitBreakerRegistry } from '@/resilience/circuit-breaker.js';
import type { ConcurrencyTracker } from '@/resilience/concurrency-tracker.js';
import type { RetryHandler } from '@/resilience/retry-handler.js';
import { EndpointCatalog } from '@/network/endpoint-catalog.js';
import { NetworkSniffer } from '@/network/sniffer.js';
import { StepExecutor } from '@/engine/step-executor.js';
import { WorkflowParser } from '@/engine/workflow-parser.js';
import {
  BROWSER_DEFAULTS,
  EXECUTION_STATUS_NAMES,
  TIMEOUT_DEFAULTS,
} from '@/constants/index.js';
import { cookieStorageService } from '@/recorder/cookie-storage-service.js';

export class WorkflowOrchestrator {
  private pool: BrowserPool;
  private circuitBreakers: CircuitBreakerRegistry;
  private tracker: ConcurrencyTracker;
  private retryHandler: RetryHandler;

  constructor(
    pool: BrowserPool,
    circuitBreakers: CircuitBreakerRegistry,
    tracker: ConcurrencyTracker,
    retryHandler: RetryHandler
  ) {
    this.pool = pool;
    this.circuitBreakers = circuitBreakers;
    this.tracker = tracker;
    this.retryHandler = retryHandler;
  }

  getPool(): BrowserPool {
    return this.pool;
  }

  async execute(
    rawWorkflow: unknown,
    runtimeOverrides?: Record<string, unknown>
  ): Promise<WorkflowExecutionResponse> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const workflow = WorkflowParser.parse(rawWorkflow);
    const domain = workflow.circuitBreakerDomain;

    const { activeAtStart, queueWaitStart } = this.tracker.recordTaskStart();
    let queueWaitDurationMs = 0;
    let assignedSlotId = 0;
    let stuckKilled = false;
    let stuckDetails: WorkflowExecutionResponse['resilienceMetrics']['stuckDetails'];

    const catalog = new EndpointCatalog(workflow.baseUrl || '');
    let accumulatedStepResults: StepExecutionResult[] = [];
    let finalOutputs: Record<string, unknown> = {};
    let finalStatus: ExecutionStatus = EXECUTION_STATUS_NAMES.SUCCESS;
    let executionError: string | undefined;

    // 1. Circuit Breaker Pre-flight Check
    try {
      this.circuitBreakers.checkAllowed(domain);
    } catch (cbErr) {
      const isCbOpen = cbErr instanceof CircuitBreakerOpenError;
      const cbHandlers: Record<string, () => WorkflowExecutionResponse> = {
        true: () => {
          logger.warn(
            `Fast-failing workflow '${workflow.id}' due to open circuit breaker on domain '${domain}'`
          );
          const durationMs = Date.now() - startTimeMs;
          this.tracker.recordTaskCompletion(0, false);

          return this.tracker.markResponse({
            workflowId: workflow.id,
            workflowName: workflow.name,
            status: EXECUTION_STATUS_NAMES.CIRCUIT_BROKEN,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs,
            activeAtStart,
            queueWaitDurationMs: 0,
            slotAssigned: 0,
            retriesAttempted: 0,
            circuitBreakerDomain: domain,
            stuckProcessKilled: false,
            networkAuthSummary: {
              endpointsScanned: 0,
              authDetected: false,
              authRequiredCount: 0,
              authTypesDiscovered: [],
              topProtectedEndpoints: [],
            },
            extractedOutputs: {},
            stepResults: [],
            error: (cbErr as Error).message,
          });
        },
        false: () => {
          throw cbErr;
        },
      };

      return (cbHandlers[String(isCbOpen)] ?? cbHandlers.false)();
    }

    // 2. Retry Wrapper around Browser Execution
    const maxRetries = workflow.retryConfig?.maxRetries;

    try {
      const retryResult = await this.retryHandler.executeWithRetry(
        `Workflow-${workflow.id}`,
        async (attempt) => {
          accumulatedStepResults = [];
          const context = WorkflowParser.createContext(workflow, runtimeOverrides);

          return await this.pool.executeWithSlot(
            `task-${workflow.id}-try-${attempt}`,
            workflow.id,
            async (slot, browser) => {
              assignedSlotId = slot.slotId;
              queueWaitDurationMs = Date.now() - queueWaitStart;

              const stepTimeout = workflow.stepTimeoutMs || TIMEOUT_DEFAULTS.STEP_WATCHDOG_MS;
              const browserPid = this.pool.getBrowserPid();

              const watchdog = new TaskWatchdog({
                taskId: `task-${workflow.id}-try-${attempt}`,
                timeoutMs: stepTimeout,
                browserPid,
                onStuckKilled: (pid, durationMs) => {
                  stuckKilled = true;
                  stuckDetails = {
                    pidKilled: pid,
                    durationBeforeKillMs: durationMs,
                    reason: `Exceeded step timeout of ${stepTimeout}ms`,
                  };
                  void this.pool.markStuckAndRespawn(slot, 'Watchdog timeout triggered kill');
                },
              });

              const storageStateFile = cookieStorageService.loadStorageState();
              const browserContext = await browser.newContext({
                viewport: workflow.viewport || BROWSER_DEFAULTS.VIEWPORT,
                userAgent: workflow.userAgent,
                ...(storageStateFile ? { storageState: storageStateFile } : {}),
              });

              const page = await browserContext.newPage();
              const sniffer = new NetworkSniffer(page, catalog);
              sniffer.attach();

              try {
                for (const step of workflow.steps) {
                  watchdog.setCurrentStep(step.id);
                  watchdog.arm();

                  let stepRes: StepExecutionResult = {
                    stepId: step.id,
                    action: step.action,
                    status: EXECUTION_STATUS_NAMES.FAILED,
                    durationMs: 0,
                    timestamp: new Date().toISOString(),
                  };
                  try {
                    stepRes = await StepExecutor.executeStep(step, page, context, workflow.baseUrl);
                  } catch (err) {
                    const stuckActions: Record<string, () => never> = {
                      true: () => {
                        throw new StuckProcessError(
                          `Step '${step.id}' killed due to stuck browser process`,
                          watchdog.getElapsedMs(),
                          browserPid,
                          step.id
                        );
                      },
                      false: () => {
                        throw err;
                      },
                    };
                    stuckActions[String(stuckKilled)]();
                  } finally {
                    watchdog.disarm();
                  }

                  accumulatedStepResults.push(stepRes);

                  const isFailed = stepRes.status === EXECUTION_STATUS_NAMES.FAILED;
                  const failureActions: Record<string, () => void> = {
                    true: () => {
                      const stopActions: Record<string, () => void> = {
                        false: () => {
                          throw new Error(`Step '${step.id}' failed: ${stepRes.error}`);
                        },
                        true: () => {},
                      };
                      stopActions[String(Boolean(step.continueOnError))]();
                    },
                    false: () => {},
                  };
                  failureActions[String(isFailed)]();
                }

                finalOutputs = context.extracted;
                return { success: true };
              } finally {
                try {
                  await cookieStorageService.saveStorageState(browserContext);
                } catch (cookieErr) {
                  logger.warn(`[WorkflowOrchestrator] Cookie persist warning: ${cookieErr}`);
                }
                sniffer.detach();
                watchdog.disarm();
                await browserContext.close().catch(() => {});
              }
            }
          );
        },
        maxRetries
      );

      this.circuitBreakers.recordSuccess(domain);
      this.tracker.recordTaskCompletion(queueWaitDurationMs, true);

      const statusMap: Record<string, ExecutionStatus> = {
        true: EXECUTION_STATUS_NAMES.RETRIED_SUCCESS,
        false: EXECUTION_STATUS_NAMES.SUCCESS,
      };
      finalStatus = statusMap[String(retryResult.totalRetries > 0)] ?? EXECUTION_STATUS_NAMES.SUCCESS;

      const durationMs = Date.now() - startTimeMs;
      const catalogSummary = catalog.getSummary();

      return this.tracker.markResponse({
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: finalStatus,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        activeAtStart,
        queueWaitDurationMs,
        slotAssigned: assignedSlotId,
        retriesAttempted: retryResult.totalRetries,
        circuitBreakerDomain: domain,
        stuckProcessKilled: stuckKilled,
        stuckDetails,
        networkAuthSummary: {
          endpointsScanned: catalogSummary.totalUniqueEndpoints,
          authDetected: catalogSummary.authRequiredEndpointsCount > 0,
          authRequiredCount: catalogSummary.authRequiredEndpointsCount,
          authTypesDiscovered: Object.keys(catalogSummary.authBreakdown).filter(
            (k) => catalogSummary.authBreakdown[k as keyof typeof catalogSummary.authBreakdown] > 0 && k !== 'none'
          ),
          topProtectedEndpoints: catalog.getAuthProtectedEndpoints().slice(0, 10).map((e) => ({
            method: e.method,
            url: e.url,
            authType: e.authClassification.primaryAuthType,
            reason: e.authClassification.recommendation,
          })),
        },
        extractedOutputs: finalOutputs,
        stepResults: accumulatedStepResults,
      });
    } catch (err) {
      this.circuitBreakers.recordFailure(domain, err);
      this.tracker.recordTaskCompletion(queueWaitDurationMs, false);

      const durationMs = Date.now() - startTimeMs;
      executionError = err instanceof Error ? err.message : String(err);

      const errorStatusMap: Record<string, ExecutionStatus> = {
        true: EXECUTION_STATUS_NAMES.STUCK_PROCESS_KILLED,
        false: EXECUTION_STATUS_NAMES.FAILED,
      };
      finalStatus = errorStatusMap[String(stuckKilled)] ?? EXECUTION_STATUS_NAMES.FAILED;

      const catalogSummary = catalog.getSummary();

      return this.tracker.markResponse({
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: finalStatus,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        activeAtStart,
        queueWaitDurationMs,
        slotAssigned: assignedSlotId,
        retriesAttempted: 0,
        circuitBreakerDomain: domain,
        stuckProcessKilled: stuckKilled,
        stuckDetails,
        networkAuthSummary: {
          endpointsScanned: catalogSummary.totalUniqueEndpoints,
          authDetected: catalogSummary.authRequiredEndpointsCount > 0,
          authRequiredCount: catalogSummary.authRequiredEndpointsCount,
          authTypesDiscovered: Object.keys(catalogSummary.authBreakdown).filter(
            (k) => catalogSummary.authBreakdown[k as keyof typeof catalogSummary.authBreakdown] > 0 && k !== 'none'
          ),
          topProtectedEndpoints: catalog.getAuthProtectedEndpoints().slice(0, 10).map((e) => ({
            method: e.method,
            url: e.url,
            authType: e.authClassification.primaryAuthType,
            reason: e.authClassification.recommendation,
          })),
        },
        extractedOutputs: finalOutputs,
        stepResults: accumulatedStepResults,
        error: executionError,
      });
    }
  }

  getCatalogSummary(baseUrl?: string): EndpointCatalog {
    return new EndpointCatalog(baseUrl);
  }
}
