import process from "node:process";

export interface IProcessUtils {
  pid: number;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  cwd(): string;
  uptime(): number;
  memoryUsage(): NodeJS.MemoryUsage;
  exit(code?: number): void;
  getEnv(key: string, defaultValue?: string): string | undefined;
}

/**
 * Process Utility.
 * Encapsulates global process queries and runtime metrics.
 */
export class ProcessUtils implements IProcessUtils {
  public get pid(): number {
    return process.pid;
  }

  public get platform(): NodeJS.Platform {
    return process.platform;
  }

  public get env(): NodeJS.ProcessEnv {
    return process.env;
  }

  public cwd(): string {
    return process.cwd();
  }

  public uptime(): number {
    return process.uptime();
  }

  public memoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  public exit(code = 0): void {
    process.exit(code);
  }

  public getEnv(key: string, defaultValue?: string): string | undefined {
    return process.env[key] ?? defaultValue;
  }
}

export const processUtils = new ProcessUtils();
