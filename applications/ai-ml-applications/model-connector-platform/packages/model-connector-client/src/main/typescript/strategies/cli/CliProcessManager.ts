import {
  childProcessUtils,
  processUtils,
  fileUtils,
  pathUtils,
} from "@model-box/model-connector-core";
import { CliExecutionException } from "@/domain/errors/domainExceptions.js";
import { DefaultTimeoutMs, DEFAULT_CLI_LOCATIONS } from "@/domain/constants/index.js";

export interface ProcessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Enterprise CLI Process Manager.
 * Executes model CLI processes using encapsulated childProcessUtils and resolves
 * custom binary locations configured in Dockerfile / Kubernetes.
 *
 * Conforms to:
 * - STD-COD-010 & STD-COD-011: Runtime Isolation & Utils Encapsulation
 * - STD-COD-007: Resilient Error Handling
 */
export class CliProcessManager {
  /**
   * Resolves the full path to a CLI binary checking configured custom directories.
   */
  public static resolveBinaryPath(command: string): string {
    // If command already contains path separators, use as-is
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
      // On Windows check with .cmd / .exe / .ps1
      if (processUtils.platform === "win32") {
        for (const ext of [".cmd", ".exe", ".bat"]) {
          const winPath = `${candidatePath}${ext}`;
          if (fileUtils.exists(winPath)) {
            return winPath;
          }
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
    const resolvedCommand = this.resolveBinaryPath(command);

    return new Promise((resolve, reject) => {
      let stdoutData = "";
      let stderrData = "";
      let isTimedOut = false;

      const child = childProcessUtils.spawn(resolvedCommand, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...processUtils.env, ...(customEnv || {}) },
      });

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGKILL");
        reject(
          new CliExecutionException(
            `CLI process timed out after ${timeoutMs}ms`,
            -1,
            undefined,
            correlationId,
          ),
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutData += chunk.toString("utf-8");
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString("utf-8");
      });

      child.on("error", (err: Error) => {
        clearTimeout(timer);
        if (!isTimedOut) {
          reject(
            new CliExecutionException(
              `Failed to spawn CLI process '${resolvedCommand}': ${err.message}`,
              -1,
              err.message,
              correlationId,
            ),
          );
        }
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        const effectiveCode = code ?? 0;
        if (effectiveCode !== 0) {
          reject(
            new CliExecutionException(
              `CLI command '${resolvedCommand}' exited with code ${effectiveCode}`,
              effectiveCode,
              stderrData,
              correlationId,
            ),
          );
          return;
        }

        resolve({ stdout: stdoutData, stderr: stderrData, exitCode: effectiveCode });
      });

      if (stdinInput && child.stdin) {
        child.stdin.write(stdinInput);
        child.stdin.end();
      }
    });
  }
}
