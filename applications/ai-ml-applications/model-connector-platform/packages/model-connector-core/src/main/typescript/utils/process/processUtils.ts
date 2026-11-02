import process from "node:process";

export interface IProcessUtils {
  readonly pid: number;
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly argv: readonly string[];
  cwd(): string;
  uptime(): number;
  memoryUsage(): NodeJS.MemoryUsage;
  exit(code?: number): void;
  on(event: string, listener: (...args: any[]) => void): void;
  getEnv(key: string): string | undefined;
  getEnv(key: string, defaultValue: string): string;
  getRequiredEnv(key: string): string;
  hasEnv(key: string): boolean;
}

/**
 * Enterprise Process Utility.
 * Exclusive authority for process.* and process.env access across the platform.
 * Conforms to Directive #10: Runtime Isolation & Environment Encapsulation.
 */
export class ProcessUtils implements IProcessUtils {
  public get pid(): number {
    return process.pid;
  }

  public get platform(): NodeJS.Platform {
    return process.platform;
  }

  public get env(): Readonly<Record<string, string | undefined>> {
    return Object.freeze({ ...process.env });
  }

  public get argv(): readonly string[] {
    return Object.freeze([...process.argv]);
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

  public on(event: string, listener: (...args: any[]) => void): void {
    process.on(event, listener);
  }

  public static getEnv(key: string): string | undefined;
  public static getEnv(key: string, defaultValue: string): string;
  public static getEnv(key: string, defaultValue?: string): string | undefined {
    return process.env[key] ?? defaultValue;
  }

  public static getRequiredEnv(key: string): string {
    const val = process.env[key];
    if (val === undefined || val.trim() === "") {
      throw new Error(`[ProcessUtils] Required environment variable '${key}' is not set.`);
    }
    return val;
  }

  public static hasEnv(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== undefined;
  }

  public getEnv(key: string): string | undefined;
  public getEnv(key: string, defaultValue: string): string;
  public getEnv(key: string, defaultValue?: string): string | undefined {
    return ProcessUtils.getEnv(key, defaultValue as any);
  }

  public getRequiredEnv(key: string): string {
    return ProcessUtils.getRequiredEnv(key);
  }

  public hasEnv(key: string): boolean {
    return ProcessUtils.hasEnv(key);
  }
}

export const processUtils: IProcessUtils = new ProcessUtils();
