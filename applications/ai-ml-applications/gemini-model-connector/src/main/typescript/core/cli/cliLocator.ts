import fs from 'node:fs';
import path from 'node:path';
import { environment, type Environment } from '@/core/config/environment.js';

export interface IExecutableExtensionStrategy {
  supports(isWindows: boolean): boolean;
  getExtensions(): readonly string[];
}

export class WindowsExecutableExtensionStrategy implements IExecutableExtensionStrategy {
  public supports(isWindows: boolean): boolean {
    return isWindows;
  }

  public getExtensions(): readonly string[] {
    return ['.cmd', '.exe', '.bat', ''];
  }
}

export class PosixExecutableExtensionStrategy implements IExecutableExtensionStrategy {
  public supports(isWindows: boolean): boolean {
    return !isWindows;
  }

  public getExtensions(): readonly string[] {
    return [''];
  }
}

/**
 * Strategy Registry for Executable Extensions (STD-COD-005).
 */
export class ExecutableExtensionRegistry {
  private readonly strategies: IExecutableExtensionStrategy[] = [];
  private readonly fallback = new PosixExecutableExtensionStrategy();

  constructor() {
    this.register(new WindowsExecutableExtensionStrategy());
    this.register(this.fallback);
  }

  public register(strategy: IExecutableExtensionStrategy): void {
    this.strategies.push(strategy);
  }

  public resolve(isWindows: boolean): IExecutableExtensionStrategy {
    const matched = this.strategies.find((s) => s.supports(isWindows));
    return matched || this.fallback;
  }
}

export const executableExtensionRegistry = new ExecutableExtensionRegistry();

export interface ICliLocator {
  isAvailable(command: string): boolean;
  locate(command: string): string | null;
}

/**
 * OOP System CLI Locator Service.
 * Replaces inline procedural loops and eliminates process.platform calls by using the Environment abstraction.
 */
export class SystemCliLocator implements ICliLocator {
  constructor(
    private readonly env: Environment = environment,
    private readonly extensionRegistry: ExecutableExtensionRegistry = executableExtensionRegistry
  ) {}

  public isAvailable(command: string): boolean {
    return this.locate(command) !== null;
  }

  public locate(command: string): string | null {
    const pathDirs = this.getPathDirectories();
    const extensions = this.extensionRegistry.resolve(this.env.isWindows()).getExtensions();

    for (const dir of pathDirs) {
      const match = this.probeDirectory(dir, command, extensions);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private getPathDirectories(): string[] {
    const pathEnv = this.env.getProperty('PATH', '');
    if (!pathEnv) {
      return [];
    }
    return pathEnv.split(path.delimiter);
  }

  private probeDirectory(dir: string, command: string, extensions: readonly string[]): string | null {
    for (const ext of extensions) {
      const fullPath = path.join(dir, `${command}${ext}`);
      if (this.isFileExecutable(fullPath)) {
        return fullPath;
      }
    }
    return null;
  }

  private isFileExecutable(targetPath: string): boolean {
    try {
      return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
    } catch {
      return false;
    }
  }
}

export const systemCliLocator = new SystemCliLocator();
