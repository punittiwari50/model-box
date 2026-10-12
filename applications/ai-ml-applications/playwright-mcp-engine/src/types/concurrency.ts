import type { Browser } from 'playwright';

export interface PlaywrightProcessHandle {
  pid?: number;
}

export interface PlaywrightBrowserProcessHolder {
  process?: () => PlaywrightProcessHandle | undefined;
}

export type PlaywrightBrowserWithProcess = Browser & PlaywrightBrowserProcessHolder;

export interface WorkerSlot {
  slotId: number;
  browserPid?: number;
  activeTaskId?: string;
  isBusy: boolean;
  assignedAt?: number;
  lastHeartbeatAt?: number;
  pagesHandled: number;
  stuckKillsCount: number;
}

export interface PoolConfig {
  maxConcurrency: number;
  maxPagesPerContext: number;
  browserType: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  launchArgs?: string[];
  stepWatchdogTimeoutMs: number;
  workflowWatchdogTimeoutMs: number;
  stuckGracePeriodMs: number;
}

export interface TaskQueueItem<T = unknown> {
  taskId: string;
  workflowId: string;
  priority: number;
  queuedAt: number;
  run: (slot: WorkerSlot) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export interface ConcurrencyMetricsSnapshot {
  timestamp: string;
  maxConcurrency: number;
  currentActive: number;
  queueLength: number;
  peakConcurrency: number;
  totalTasksProcessed: number;
  totalTasksSucceeded: number;
  totalTasksFailed: number;
  totalStuckProcessesKilled: number;
  averageQueueWaitMs: number;
  workerSlots: Array<{
    slotId: number;
    isBusy: boolean;
    browserPid?: number;
    activeTaskId?: string;
    runtimeDurationMs?: number;
    pagesHandled: number;
    stuckKillsCount: number;
  }>;
}
