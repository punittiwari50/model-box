import { execSync } from 'node:child_process';
import process from 'node:process';
import treeKill from 'tree-kill';
import { logger } from '@/core/logger.js';

// ============================================================================
// Distributed Systems / Microservices Command & Result Contracts (SOLID: SRP)
// ============================================================================

export interface KillCommand {
  readonly pid: number;
  readonly reason: string;
  readonly correlationId: string;
  readonly timestamp: number;
}

export interface KillResult {
  readonly success: boolean;
  readonly strategyName: string;
  readonly error?: unknown;
}

// ============================================================================
// Strategy Pattern Interfaces (SOLID: OCP, LSP, ISP, DIP)
// ============================================================================

export interface IKillStrategy {
  readonly name: string;
  execute(command: KillCommand): Promise<KillResult>;
}

export interface IStrategyChainNode {
  executeChain(command: KillCommand): Promise<boolean>;
}

export interface IProcessLivenessProbe {
  probe(pid: number): boolean;
}

export interface IProcessKillerService {
  killPid(pid: number, reason?: string): Promise<boolean>;
  isProcessAlive(pid: number): boolean;
}

// ============================================================================
// Concrete Strategy: TreeKill Strategy (SIGKILL via tree-kill library)
// ============================================================================

export class TreeKillStrategy implements IKillStrategy {
  readonly name = 'TreeKillStrategy';

  async execute(command: KillCommand): Promise<KillResult> {
    return new Promise<KillResult>((resolve) => {
      treeKill(command.pid, 'SIGKILL', (err) => {
        const errorState = String(Boolean(err));
        const outcomes: Record<string, () => KillResult> = {
          false: () => {
            logger.info(
              `ProcessKiller [${command.correlationId}]: Successfully killed PID ${command.pid} via ${this.name}`
            );
            return { success: true, strategyName: this.name };
          },
          true: () => {
            logger.warn(
              `ProcessKiller [${command.correlationId}]: ${this.name} failed for PID ${command.pid}: ${err?.message}. Passing to next chain...`
            );
            return { success: false, strategyName: this.name, error: err };
          },
        };

        const handler = outcomes[errorState] ?? outcomes.true;
        resolve(handler());
      });
    });
  }
}

// ============================================================================
// Concrete Strategy: Windows Native Taskkill Strategy (taskkill /F /T)
// ============================================================================

export class WindowsTaskKillStrategy implements IKillStrategy {
  readonly name = 'WindowsTaskKillStrategy';

  async execute(command: KillCommand): Promise<KillResult> {
    try {
      execSync(`taskkill /F /T /PID ${command.pid}`, { stdio: 'ignore' });
      logger.info(
        `ProcessKiller [${command.correlationId}]: Successfully terminated PID ${command.pid} via ${this.name}`
      );
      return { success: true, strategyName: this.name };
    } catch (error) {
      logger.error(
        `ProcessKiller [${command.correlationId}]: ${this.name} execution failed for PID ${command.pid}`,
        error
      );
      return { success: false, strategyName: this.name, error };
    }
  }
}

// ============================================================================
// Concrete Strategy: POSIX Native Signal Strategy (process.kill SIGKILL)
// ============================================================================

export class PosixKillStrategy implements IKillStrategy {
  readonly name = 'PosixKillStrategy';

  async execute(command: KillCommand): Promise<KillResult> {
    try {
      process.kill(command.pid, 'SIGKILL');
      logger.info(
        `ProcessKiller [${command.correlationId}]: Successfully terminated PID ${command.pid} via ${this.name}`
      );
      return { success: true, strategyName: this.name };
    } catch (error) {
      logger.error(
        `ProcessKiller [${command.correlationId}]: ${this.name} execution failed for PID ${command.pid}`,
        error
      );
      return { success: false, strategyName: this.name, error };
    }
  }
}

// ============================================================================
// OS Platform Resolver: Dynamic Registry Pattern (Polymorphic OS Execution)
// ============================================================================

export class OsStrategyRegistry {
  private static readonly PLATFORM_STRATEGIES: Readonly<Record<string, IKillStrategy>> = {
    win32: new WindowsTaskKillStrategy(),
    darwin: new PosixKillStrategy(),
    linux: new PosixKillStrategy(),
    freebsd: new PosixKillStrategy(),
    openbsd: new PosixKillStrategy(),
    sunos: new PosixKillStrategy(),
    aix: new PosixKillStrategy(),
  };

  static resolveForCurrentPlatform(): IKillStrategy {
    const currentPlatform = process.platform;
    return this.PLATFORM_STRATEGIES[currentPlatform] ?? new PosixKillStrategy();
  }
}

// ============================================================================
// Chain of Responsibility Pattern: Resilient Execution Pipeline
// ============================================================================

export class StrategyChainNode implements IStrategyChainNode {
  constructor(
    private readonly strategy: IKillStrategy,
    private readonly next?: IStrategyChainNode
  ) {}

  async executeChain(command: KillCommand): Promise<boolean> {
    const result = await this.strategy.execute(command);
    const hasNext = Boolean(this.next);

    // Dictionary dispatch for resilient pipeline progression
    const continuationActions: Record<string, () => Promise<boolean>> = {
      true: async () => true,
      false: async () => {
        const nextActions: Record<string, () => Promise<boolean>> = {
          true: async () => this.next!.executeChain(command),
          false: async () => false,
        };
        const action = nextActions[String(hasNext)] ?? (async () => false);
        return action();
      },
    };

    const action = continuationActions[String(result.success)] ?? (async () => false);
    return action();
  }
}

// ============================================================================
// Liveness Probe: Diagnostic Strategy (Signal Interrogation)
// ============================================================================

export class ProcessLivenessProbe implements IProcessLivenessProbe {
  private static readonly PERMISSIBLE_ERROR_CODES: Readonly<Record<string, boolean>> = {
    EPERM: true,
  };

  probe(pid: number): boolean {
    const isSyntacticallyValid = Number.isInteger(pid) && pid > 0;
    const probeExecutors: Record<string, () => boolean> = {
      false: () => false,
      true: () => this.executeSignalCheck(pid),
    };

    const executor = probeExecutors[String(isSyntacticallyValid)] ?? (() => false);
    return executor();
  }

  private executeSignalCheck(pid: number): boolean {
    try {
      return Boolean(process.kill(pid, 0));
    } catch (err: unknown) {
      const errorCode = String((err as { code?: string })?.code);
      return ProcessLivenessProbe.PERMISSIBLE_ERROR_CODES[errorCode] ?? false;
    }
  }
}

// ============================================================================
// Core Microservice Orchestrator: Process Killer Service (OOP Service Layer)
// ============================================================================

export class ProcessKillerService implements IProcessKillerService {
  private static instance: ProcessKillerService;

  constructor(
    private readonly executionPipeline: IStrategyChainNode,
    private readonly livenessProbe: IProcessLivenessProbe
  ) {}

  static getInstance(): ProcessKillerService {
    const hasInstance = Boolean(ProcessKillerService.instance);
    const instanceResolver: Record<string, () => ProcessKillerService> = {
      true: () => ProcessKillerService.instance,
      false: () => {
        const pipeline = new StrategyChainNode(
          new TreeKillStrategy(),
          new StrategyChainNode(OsStrategyRegistry.resolveForCurrentPlatform())
        );
        ProcessKillerService.instance = new ProcessKillerService(
          pipeline,
          new ProcessLivenessProbe()
        );
        return ProcessKillerService.instance;
      },
    };

    const resolver = instanceResolver[String(hasInstance)] ?? instanceResolver.false;
    return resolver();
  }

  async killPid(pid: number, reason = 'Stuck process timeout'): Promise<boolean> {
    const isValidPid = Number.isInteger(pid) && pid > 0;
    const correlationId = `proc-${pid}-${Date.now()}`;

    const command: KillCommand = {
      pid,
      reason,
      correlationId,
      timestamp: Date.now(),
    };

    // Dictionary dispatch handling valid vs invalid PID without branching statements
    const validationHandlers: Record<string, () => Promise<boolean>> = {
      false: async () => {
        logger.warn(`ProcessKiller [${correlationId}]: Invalid PID ${pid}`);
        return false;
      },
      true: async () => {
        logger.warn(
          `ProcessKiller [${correlationId}]: Initiating termination chain for PID ${pid} - Reason: ${reason}`
        );
        return this.executionPipeline.executeChain(command);
      },
    };

    const handler = validationHandlers[String(isValidPid)] ?? validationHandlers.false;
    return handler();
  }

  isProcessAlive(pid: number): boolean {
    return this.livenessProbe.probe(pid);
  }
}

// ============================================================================
// Backward-Compatible Facade (Preserves exact static contract for callers)
// ============================================================================

export class ProcessKiller {
  static async killPid(pid: number, reason = 'Stuck process timeout'): Promise<boolean> {
    return ProcessKillerService.getInstance().killPid(pid, reason);
  }

  static isProcessAlive(pid: number): boolean {
    return ProcessKillerService.getInstance().isProcessAlive(pid);
  }
}
