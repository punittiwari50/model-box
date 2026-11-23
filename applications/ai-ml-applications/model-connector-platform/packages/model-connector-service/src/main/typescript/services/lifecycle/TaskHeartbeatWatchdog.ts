import { environment, type Environment } from "@model-box/model-connector-core";

export type TaskStatus =
  | "PENDING_ENQUEUE"
  | "AWAITING_RESOURCES"
  | "INITIALIZING_CONTEXT"
  | "STREAMING_INFERENCE"
  | "AWAITING_MCP_TOOL"
  | "EXECUTING_MCP_TOOL"
  | "AWAITING_HUMAN_APPROVAL"
  | "COMPACTING_CONTEXT"
  | "CHECKPOINTING_STATE"
  | "DEGRADED_FAILOVER"
  | "HEARTBEAT_STALLED"
  | "COMPLETED"
  | "CANCELLED_BY_USER"
  | "FAILED_WITH_CLASSIFICATION";

export interface HeartbeatEvaluationResult {
  readonly taskId: string;
  readonly isHealthy: boolean;
  readonly elapsedSinceLastPulseSeconds: number;
  readonly recommendedAction: "NONE" | "MARK_STALLED" | "FORCE_TERMINATE_AND_FAILOVER";
}

/**
 * Task Heartbeat Watchdog.
 * Evaluates worker pulse freshness and orchestrates stalled task recovery.
 *
 * Conforms to:
 * - UC-12: Long-Running AI Task Lifecycle & Status Orchestration
 * - STD-COD-002: Dynamic configuration values loaded from application.yml
 * - STD-COD-007: Resilient Error Handling & Immutability by Default
 */
export class TaskHeartbeatWatchdog {
  private readonly heartbeatTimeoutSeconds: number;
  private readonly maxStalledTimeoutSeconds: number;

  constructor(env: Environment = environment) {
    this.heartbeatTimeoutSeconds = env.getPropertyAsNumber(
      "tasks.lifecycle.heartbeatTimeoutSeconds",
      30
    );
    this.maxStalledTimeoutSeconds = env.getPropertyAsNumber(
      "tasks.lifecycle.maxStalledTimeoutSeconds",
      90
    );
  }

  public getHeartbeatTimeoutSeconds(): number {
    return this.heartbeatTimeoutSeconds;
  }

  public getMaxStalledTimeoutSeconds(): number {
    return this.maxStalledTimeoutSeconds;
  }

  public evaluateTaskLiveness(
    taskId: string,
    lastHeartbeatUtc: Date,
    currentStatus: TaskStatus
  ): HeartbeatEvaluationResult {
    // If task is waiting for human approval or in a terminal state, heartbeat timeouts are suspended
    if (
      currentStatus === "AWAITING_HUMAN_APPROVAL" ||
      currentStatus === "COMPLETED" ||
      currentStatus === "CANCELLED_BY_USER"
    ) {
      return Object.freeze({
        taskId,
        isHealthy: true,
        elapsedSinceLastPulseSeconds: 0,
        recommendedAction: "NONE",
      });
    }

    const elapsedSeconds = Math.floor((Date.now() - lastHeartbeatUtc.getTime()) / 1000);

    if (elapsedSeconds > this.maxStalledTimeoutSeconds) {
      return Object.freeze({
        taskId,
        isHealthy: false,
        elapsedSinceLastPulseSeconds: elapsedSeconds,
        recommendedAction: "FORCE_TERMINATE_AND_FAILOVER",
      });
    }

    if (elapsedSeconds > this.heartbeatTimeoutSeconds) {
      return Object.freeze({
        taskId,
        isHealthy: false,
        elapsedSinceLastPulseSeconds: elapsedSeconds,
        recommendedAction: "MARK_STALLED",
      });
    }

    return Object.freeze({
      taskId,
      isHealthy: true,
      elapsedSinceLastPulseSeconds: elapsedSeconds,
      recommendedAction: "NONE",
    });
  }
}

export const taskHeartbeatWatchdog = new TaskHeartbeatWatchdog();
