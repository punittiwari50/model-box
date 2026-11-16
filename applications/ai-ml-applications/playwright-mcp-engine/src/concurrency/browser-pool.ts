import { type Browser, chromium, firefox, webkit } from 'playwright';
import { logger } from '@/core/logger.js';
import type {
  PlaywrightBrowserWithProcess,
  PoolConfig,
  TaskQueueItem,
  WorkerSlot,
} from '@/types/concurrency.js';
import { ProcessKiller } from '@/concurrency/process-killer.js';
import { BROWSER_DEFAULTS } from '@/constants/index.js';

// ============================================================================
// Browser Launcher Strategy Pattern (SOLID: OCP, LSP, ISP, DIP)
// ============================================================================

export interface IBrowserLauncherStrategy {
  launch(options: { headless: boolean; args: string[] }): Promise<Browser>;
}

export class ChromiumLauncherStrategy implements IBrowserLauncherStrategy {
  launch(options: { headless: boolean; args: string[] }): Promise<Browser> {
    return chromium.launch(options);
  }
}

export class FirefoxLauncherStrategy implements IBrowserLauncherStrategy {
  launch(options: { headless: boolean; args: string[] }): Promise<Browser> {
    return firefox.launch(options);
  }
}

export class WebkitLauncherStrategy implements IBrowserLauncherStrategy {
  launch(options: { headless: boolean; args: string[] }): Promise<Browser> {
    return webkit.launch(options);
  }
}

export class BrowserLauncherRegistry {
  private static readonly LAUNCHERS: Readonly<Record<string, IBrowserLauncherStrategy>> = {
    chromium: new ChromiumLauncherStrategy(),
    firefox: new FirefoxLauncherStrategy(),
    webkit: new WebkitLauncherStrategy(),
  };

  static getLauncher(browserType: string): IBrowserLauncherStrategy {
    return this.LAUNCHERS[browserType] ?? new ChromiumLauncherStrategy();
  }
}

// ============================================================================
// High-Concurrency Browser Pool Manager
// ============================================================================

export class BrowserPool {
  private config: PoolConfig;
  private browserInstance: Browser | null = null;
  private browserPid?: number;
  private slots: WorkerSlot[] = [];
  private taskQueue: TaskQueueItem[] = [];
  private isShuttingDown = false;
  private stuckKillsTotal = 0;

  constructor(config: PoolConfig) {
    this.config = config;
    for (let i = 0; i < config.maxConcurrency; i++) {
      this.slots.push({
        slotId: i + 1,
        isBusy: false,
        pagesHandled: 0,
        stuckKillsCount: 0,
      });
    }
  }

  async initialize(): Promise<void> {
    logger.info(
      `BrowserPool initialized with ${this.config.maxConcurrency} concurrency slots (Headless: ${this.config.headless})`
    );
  }

  private async ensureBrowser(): Promise<Browser> {
    const isConnected = Boolean(this.browserInstance?.isConnected());
    const browserResolvers: Record<string, () => Promise<Browser>> = {
      true: async () => this.browserInstance!,
      false: async () => this.launchNewBrowserInstance(),
    };

    const resolver = browserResolvers[String(isConnected)] ?? browserResolvers.false;
    return resolver();
  }

  private async launchNewBrowserInstance(): Promise<Browser> {
    logger.info(`Launching fresh Playwright ${this.config.browserType} instance...`);
    const launcher = BrowserLauncherRegistry.getLauncher(this.config.browserType);

    this.browserInstance = await launcher.launch({
      headless: this.config.headless,
      args: [...(this.config.launchArgs ?? [])],
    });

    const proc = (this.browserInstance as PlaywrightBrowserWithProcess).process?.();
    this.browserPid = proc?.pid;
    logger.info(`Playwright browser launched successfully. PID: ${this.browserPid ?? 'N/A'}`);

    this.browserInstance.on('disconnected', () => {
      logger.warn('Playwright browser disconnected.');
      this.browserInstance = null;
      this.browserPid = undefined;
    });

    return this.browserInstance;
  }

  async acquireSlot(): Promise<WorkerSlot> {
    const available = this.slots.find((s) => !s.isBusy);
    const hasAvailable = Boolean(available);

    const slotAcquisitionActions: Record<string, () => Promise<WorkerSlot>> = {
      true: async () => {
        available!.isBusy = true;
        available!.assignedAt = Date.now();
        available!.browserPid = this.browserPid;
        return available!;
      },
      false: () => this.pollForAvailableSlot(),
    };

    const action = slotAcquisitionActions[String(hasAvailable)] ?? slotAcquisitionActions.false;
    return action();
  }

  private pollForAvailableSlot(): Promise<WorkerSlot> {
    return new Promise<WorkerSlot>((resolve) => {
      const checkInterval = setInterval(() => {
        const slot = this.slots.find((s) => !s.isBusy);
        const isSlotAvailable = Boolean(slot);

        const pollActions: Record<string, () => void> = {
          true: () => {
            clearInterval(checkInterval);
            slot!.isBusy = true;
            slot!.assignedAt = Date.now();
            slot!.browserPid = this.browserPid;
            resolve(slot!);
          },
          false: () => {},
        };

        const pollAction = pollActions[String(isSlotAvailable)] ?? pollActions.false;
        pollAction();
      }, BROWSER_DEFAULTS.SLOT_CHECK_INTERVAL_MS);
    });
  }

  releaseSlot(slot: WorkerSlot): void {
    const found = this.slots.find((s) => s.slotId === slot.slotId);
    const hasFound = Boolean(found);

    const releaseActions: Record<string, () => void> = {
      true: () => {
        found!.isBusy = false;
        found!.activeTaskId = undefined;
        found!.assignedAt = undefined;
        found!.lastHeartbeatAt = undefined;
        found!.pagesHandled++;
      },
      false: () => {},
    };

    const action = releaseActions[String(hasFound)] ?? releaseActions.false;
    action();
  }

  async markStuckAndRespawn(slot: WorkerSlot, reason: string): Promise<void> {
    this.stuckKillsTotal++;
    slot.stuckKillsCount++;

    const deadPid = this.browserPid;
    logger.warn(
      `Marking worker slot ${slot.slotId} as stuck. Reason: ${reason}. Total kills: ${this.stuckKillsTotal}`
    );

    const hasDeadPid = Boolean(deadPid);
    const killActions: Record<string, () => Promise<void>> = {
      true: async () => {
        await ProcessKiller.killPid(deadPid!, reason);
      },
      false: async () => {},
    };

    const killAction = killActions[String(hasDeadPid)] ?? killActions.false;
    await killAction();

    const hasInstance = Boolean(this.browserInstance);
    const closeActions: Record<string, () => Promise<void>> = {
      true: async () => {
        try {
          await Promise.race([
            this.browserInstance!.close(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Browser close timeout')),
                BROWSER_DEFAULTS.BROWSER_CLOSE_TIMEOUT_MS
              )
            ),
          ]).catch(() => {});
        } catch {
          // Force killed
        }
      },
      false: async () => {},
    };

    const closeAction = closeActions[String(hasInstance)] ?? closeActions.false;
    await closeAction();

    this.browserInstance = null;
    this.browserPid = undefined;
    this.releaseSlot(slot);

    try {
      await this.ensureBrowser();
    } catch (err) {
      logger.error('Failed to respawn browser instance after killing stuck process', err);
    }
  }

  async executeWithSlot<T>(
    taskId: string,
    workflowId: string,
    action: (slot: WorkerSlot, browser: Browser) => Promise<T>
  ): Promise<T> {
    const queuedAt = Date.now();
    const slot = await this.acquireSlot();
    slot.activeTaskId = taskId;
    const waitDurationMs = Date.now() - queuedAt;

    const shouldLogWait = waitDurationMs > 100;
    const waitLogActions: Record<string, () => void> = {
      true: () => logger.debug(`Task '${taskId}' waited ${waitDurationMs}ms for concurrency slot`),
      false: () => {},
    };
    waitLogActions[String(shouldLogWait)]();

    try {
      const browser = await this.ensureBrowser();
      return await action(slot, browser);
    } finally {
      this.releaseSlot(slot);
    }
  }

  async getBrowser(): Promise<Browser> {
    return this.ensureBrowser();
  }

  getBrowserPid(): number | undefined {
    return this.browserPid;
  }

  getActiveConcurrency(): number {
    return this.slots.filter((s) => s.isBusy).length;
  }

  getMaxConcurrency(): number {
    return this.config.maxConcurrency;
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  getTotalStuckKills(): number {
    return this.stuckKillsTotal;
  }

  getSlotsSnapshot() {
    return this.slots.map((s) => ({
      slotId: s.slotId,
      isBusy: s.isBusy,
      browserPid: s.browserPid,
      activeTaskId: s.activeTaskId,
      runtimeDurationMs: s.assignedAt ? Date.now() - s.assignedAt : 0,
      pagesHandled: s.pagesHandled,
      stuckKillsCount: s.stuckKillsCount,
    }));
  }

  async close(): Promise<void> {
    this.isShuttingDown = true;
    const hasInstance = Boolean(this.browserInstance);

    const shutdownActions: Record<string, () => Promise<void>> = {
      true: async () => {
        try {
          await this.browserInstance!.close();
        } catch {
          const hasPid = Boolean(this.browserPid);
          const fallbackActions: Record<string, () => Promise<void>> = {
            true: async () => {
              await ProcessKiller.killPid(this.browserPid!, 'Pool shutdown');
            },
            false: async () => {},
          };
          await (fallbackActions[String(hasPid)] ?? fallbackActions.false)();
        }
      },
      false: async () => {},
    };

    const action = shutdownActions[String(hasInstance)] ?? shutdownActions.false;
    await action();
    this.browserInstance = null;
  }
}
