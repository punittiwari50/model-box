import { logger } from '@/core/logger.js';
import { ProcessKiller } from '@/concurrency/process-killer.js';
import { TIMEOUT_DEFAULTS } from '@/constants/index.js';

export class StuckProcessError extends Error {
  pid?: number;
  durationMs: number;
  stepId?: string;

  constructor(message: string, durationMs: number, pid?: number, stepId?: string) {
    super(message);
    this.name = 'StuckProcessError';
    this.durationMs = durationMs;
    this.pid = pid;
    this.stepId = stepId;
  }
}

export class TaskWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private startTime: number;
  private timeoutMs: number;
  private browserPid?: number;
  private taskId: string;
  private currentStepId?: string;
  private onStuckKilled?: (pid?: number, durationMs?: number) => void;
  private isDisposed = false;

  constructor(options: {
    taskId: string;
    timeoutMs?: number;
    browserPid?: number;
    onStuckKilled?: (pid?: number, durationMs?: number) => void;
  }) {
    this.taskId = options.taskId;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_DEFAULTS.STEP_WATCHDOG_MS;
    this.browserPid = options.browserPid;
    this.onStuckKilled = options.onStuckKilled;
    this.startTime = Date.now();
  }

  setBrowserPid(pid: number): void {
    this.browserPid = pid;
  }

  setCurrentStep(stepId: string): void {
    this.currentStepId = stepId;
  }

  arm(): void {
    this.disarm();
    this.isDisposed = false;

    this.timer = setTimeout(async () => {
      // Polymorphic handler for disposed state
      const tripActions: Record<string, () => Promise<void>> = {
        true: async () => {},
        false: async () => {
          const elapsed = Date.now() - this.startTime;
          logger.warn(
            `Watchdog tripped for Task '${this.taskId}' on step '${this.currentStepId || 'unknown'}' after ${elapsed}ms (Limit: ${this.timeoutMs}ms)`
          );

          const hasPid = Boolean(this.browserPid);
          const pidActions: Record<string, () => Promise<void>> = {
            true: async () => {
              logger.error(`Executing forced kill on stuck browser PID ${this.browserPid}...`);
              await ProcessKiller.killPid(
                this.browserPid!,
                `Watchdog exceeded timeout (${elapsed}ms > ${this.timeoutMs}ms) on step ${this.currentStepId}`
              );
            },
            false: async () => {},
          };

          const pidAction = pidActions[String(hasPid)] ?? pidActions.false;
          await pidAction();

          const hasCallback = Boolean(this.onStuckKilled);
          const callbackActions: Record<string, () => void> = {
            true: () => this.onStuckKilled!(this.browserPid, elapsed),
            false: () => {},
          };
          const cbAction = callbackActions[String(hasCallback)] ?? callbackActions.false;
          cbAction();
        },
      };

      const action = tripActions[String(this.isDisposed)] ?? tripActions.true;
      await action();
    }, this.timeoutMs);
  }

  disarm(): void {
    const hasTimer = Boolean(this.timer);
    const disarmActions: Record<string, () => void> = {
      true: () => {
        clearTimeout(this.timer!);
        this.timer = null;
      },
      false: () => {},
    };
    const action = disarmActions[String(hasTimer)] ?? disarmActions.false;
    action();
    this.isDisposed = true;
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}
