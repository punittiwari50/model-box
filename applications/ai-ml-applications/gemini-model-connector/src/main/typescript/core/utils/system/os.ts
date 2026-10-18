import os from 'node:os';

export interface IOperatingSystem {
  platform(): NodeJS.Platform;
  homedir(): string;
  tmpdir(): string;
  cpus(): os.CpuInfo[];
  totalmem(): number;
  freemem(): number;
  hostname(): string;
  release(): string;
  type(): string;
  arch(): string;
  isWindows(): boolean;
}

/**
 * Operating System Utility.
 * Encapsulates global node:os operations.
 */
export class OperatingSystemUtils implements IOperatingSystem {
  public platform(): NodeJS.Platform {
    return os.platform();
  }

  public homedir(): string {
    return os.homedir();
  }

  public tmpdir(): string {
    return os.tmpdir();
  }

  public cpus(): os.CpuInfo[] {
    return os.cpus();
  }

  public totalmem(): number {
    return os.totalmem();
  }

  public freemem(): number {
    return os.freemem();
  }

  public hostname(): string {
    return os.hostname();
  }

  public release(): string {
    return os.release();
  }

  public type(): string {
    return os.type();
  }

  public arch(): string {
    return os.arch();
  }

  public isWindows(): boolean {
    return os.platform() === 'win32';
  }
}

export const osUtils = new OperatingSystemUtils();
