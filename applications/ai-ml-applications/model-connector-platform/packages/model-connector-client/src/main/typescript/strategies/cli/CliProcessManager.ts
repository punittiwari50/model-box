import {
  childProcessUtils,
  processUtils,
  fileUtils,
  pathUtils,
  logger,
} from "@model-box/model-connector-core";
import { CliExecutionException } from "@/domain/errors/domainExceptions.js";
import { DefaultTimeoutMs, DEFAULT_CLI_LOCATIONS } from "@/domain/constants/index.js";

export interface ProcessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface SpawnContext {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdinInput?: string;
  readonly timeoutMs: number;
  readonly correlationId?: string;
  readonly customEnv?: Readonly<Record<string, string>>;
  readonly resolve: (result: ProcessRunResult) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Enterprise CLI Process Manager.
 * Executes model CLI processes using encapsulated childProcessUtils and resolves
 * custom binary locations configured in Dockerfile / Kubernetes.
 *
 * Conforms to:
 * - STD-COD-010 & STD-COD-011: Runtime Isolation & Utils Encapsulation
 * - STD-COD-007: Resilient Error Handling (SLAP <= 20 lines)
 */
export class CliProcessManager {
  /**
   * Resolves the full path to a CLI binary checking configured custom directories.
   */
  public static resolveBinaryPath(command: string): string {
    if (command.includes("/") || command.includes("\\")) {
      return command;
    }

    const customBinDir = processUtils.getEnv("CLI_BIN_DIR", DEFAULT_CLI_LOCATIONS.CUSTOM_BIN_DIR);
    const customNpmPrefix = processUtils.getEnv("CLI_NPM_PREFIX", DEFAULT_CLI_LOCATIONS.CUSTOM_NPM_PREFIX);
    const modelCliPath = processUtils.getEnv("MODEL_CLI_PATH", "");

    const candidateDirs = [
      customBinDir,
      pathUtils.join(customNpmPrefix, "bin"),
      ...modelCliPath.split(pathUtils.delimiter).filter(Boolean),
      "/opt/model-connector/bin",
      "/opt/model-connector/npm/bin",
    ];

    for (const dir of candidateDirs) {
      const candidatePath = pathUtils.join(dir, command);
      if (fileUtils.exists(candidatePath)) {
        return candidatePath;
      }
      if (processUtils.platform === "win32") {
        for (const ext of [".cmd", ".exe", ".bat"]) {
          const winPath = `${candidatePath}${ext}`;
          if (fileUtils.exists(winPath)) return winPath;
        }
      }
    }

    return command;
  }

  public static async executeCommand(
    command: string,
    args: readonly string[],
    stdinInput?: string,
    timeoutMs: number = DefaultTimeoutMs.CLI_TIMEOUT,
    correlationId?: string,
    customEnv?: Readonly<Record<string, string>>,
  ): Promise<ProcessRunResult> {
    const resolved = this.resolveBinaryPath(command);
    logger.info(`[CliProcessManager] Launching CLI process: ${resolved}`, {
      command: resolved,
      argsCount: args.length,
      correlationId,
    });
    return new Promise((resolve, reject) => {
      this.runSpawnedProcess({
        command: resolved,
        args,
        stdinInput,
        timeoutMs,
        correlationId,
        customEnv,
        resolve,
        reject,
      });
    });
  }

  private static runSpawnedProcess(ctx: SpawnContext): void {
    let stdoutData = "";
    let stderrData = "";
    let isTimedOut = false;

    const child = childProcessUtils.spawn(ctx.command, ctx.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...processUtils.env, ...(ctx.customEnv || {}) },
    });

    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill("SIGKILL");
      ctx.reject(new CliExecutionException(`CLI process timed out after ${ctx.timeoutMs}ms`, -1, undefined, ctx.correlationId));
    }, ctx.timeoutMs);

    this.attachProcessListeners(child, timer, ctx, () => isTimedOut, (out, err) => {
      stdoutData += out;
      stderrData += err;
    }, () => ({ stdout: stdoutData, stderr: stderrData }));
  }

  private static attachProcessListeners(
    child: ReturnType<typeof childProcessUtils.spawn>,
    timer: NodeJS.Timeout,
    ctx: SpawnContext,
    getTimedOut: () => boolean,
    appendData: (out: string, err: string) => void,
    getData: () => { stdout: string; stderr: string },
  ): void {
    child.stdout?.on("data", (chunk: Buffer) => appendData(chunk.toString("utf-8"), ""));
    child.stderr?.on("data", (chunk: Buffer) => {
      const errStr = chunk.toString("utf-8");
      appendData("", errStr);
      logger.warn(`[CliProcessManager:stderr] ${errStr.trim()}`, { correlationId: ctx.correlationId, command: ctx.command });
    });
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      if (!getTimedOut()) {
        ctx.reject(new CliExecutionException(`Failed to spawn CLI process '${ctx.command}': ${err.message}`, -1, err.message, ctx.correlationId));
      }
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (getTimedOut()) return;
      this.handleProcessClose(code ?? 0, ctx, getData());
    });
    if (ctx.stdinInput && child.stdin) {
      child.stdin.write(ctx.stdinInput);
      child.stdin.end();
    }
  }

  private static handleProcessClose(
    code: number,
    ctx: SpawnContext,
    data: { stdout: string; stderr: string },
  ): void {
    if (code !== 0) {
      logger.error(`[CliProcessManager] Process '${ctx.command}' failed with exit code ${code}`, undefined, {
        correlationId: ctx.correlationId,
        command: ctx.command,
        exitCode: code,
        stderr: data.stderr,
      });
      ctx.reject(new CliExecutionException(`CLI command '${ctx.command}' exited with code ${code}`, code, data.stderr, ctx.correlationId));
      return;
    }
    logger.info(`[CliProcessManager] Process '${ctx.command}' finished successfully with exit code 0`, {
      correlationId: ctx.correlationId,
      command: ctx.command,
    });
    ctx.resolve({ stdout: data.stdout, stderr: data.stderr, exitCode: code });
  }
}
