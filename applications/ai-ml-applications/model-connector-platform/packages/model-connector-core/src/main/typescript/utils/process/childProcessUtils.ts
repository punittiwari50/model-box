import {
  spawn as nodeSpawn,
  exec as nodeExec,
  execSync as nodeExecSync,
  type ChildProcess,
  type SpawnOptions,
  type ExecOptions,
  type ExecSyncOptions,
} from "node:child_process";

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface IChildProcessUtils {
  spawn(command: string, args?: readonly string[], options?: SpawnOptions): ChildProcess;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  execSync(command: string, options?: ExecSyncOptions): string | Buffer;
}

/**
 * Enterprise Child Process Utility.
 * Exclusive authority for node:child_process execution across the platform.
 * Conforms to:
 * - STD-COD-010: Runtime Isolation & Subprocess Governance
 * - STD-COD-007: Clean Code & Strongly Typed Execution
 */
export class ChildProcessUtils implements IChildProcessUtils {
  public static spawn(
    command: string,
    args: readonly string[] = [],
    options: SpawnOptions = {}
  ): ChildProcess {
    return nodeSpawn(command, [...args], options);
  }

  public static async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      nodeExec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          stdout: typeof stdout === "string" ? stdout : stdout.toString("utf-8"),
          stderr: typeof stderr === "string" ? stderr : stderr.toString("utf-8"),
        });
      });
    });
  }

  public static execSync(command: string, options: ExecSyncOptions = {}): string | Buffer {
    return nodeExecSync(command, options);
  }

  public spawn(command: string, args: readonly string[] = [], options: SpawnOptions = {}): ChildProcess {
    return ChildProcessUtils.spawn(command, args, options);
  }

  public async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    return ChildProcessUtils.exec(command, options);
  }

  public execSync(command: string, options: ExecSyncOptions = {}): string | Buffer {
    return ChildProcessUtils.execSync(command, options);
  }
}

export const childProcessUtils: IChildProcessUtils = new ChildProcessUtils();
export type { ChildProcess, SpawnOptions, ExecOptions, ExecSyncOptions };
