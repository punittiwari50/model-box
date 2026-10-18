import { exec } from 'node:child_process';
import { environment } from '@/core/config/environment.js';
import { logger } from '@/core/observability/logging/logger.js';

export interface IBrowserCommandStrategy {
  readonly platformName: string;
  supports(platform: string): boolean;
  buildCommand(url: string): string;
}

export class WindowsBrowserCommandStrategy implements IBrowserCommandStrategy {
  public readonly platformName = 'win32';

  public supports(platform: string): boolean {
    return platform === 'win32';
  }

  public buildCommand(url: string): string {
    return `start "" "${url}"`;
  }
}

export class DarwinBrowserCommandStrategy implements IBrowserCommandStrategy {
  public readonly platformName = 'darwin';

  public supports(platform: string): boolean {
    return platform === 'darwin';
  }

  public buildCommand(url: string): string {
    return `open "${url}"`;
  }
}

export class LinuxBrowserCommandStrategy implements IBrowserCommandStrategy {
  public readonly platformName = 'linux';

  public supports(_platform: string): boolean {
    return true; // Default fallback for all other UNIX-like runtimes
  }

  public buildCommand(url: string): string {
    return `xdg-open "${url}"`;
  }
}

/**
 * Cross-platform browser launcher utility.
 * Conforms to STD-COD-005 (Strategy Pattern) and STD-COD-007.
 */
export class HostBrowserLauncher {
  private readonly strategies: readonly IBrowserCommandStrategy[];

  constructor(
    strategies: readonly IBrowserCommandStrategy[] = [
      new WindowsBrowserCommandStrategy(),
      new DarwinBrowserCommandStrategy(),
      new LinuxBrowserCommandStrategy(),
    ]
  ) {
    this.strategies = strategies;
  }

  public async launch(url: string): Promise<boolean> {
    const platform = environment.getPlatform();
    const strategy = this.strategies.find((s) => s.supports(platform));

    if (!strategy) {
      logger.warn('BROWSER', `No browser launcher strategy found for platform: ${platform}. URL: ${url}`);
      return false;
    }

    const command = strategy.buildCommand(url);
    return new Promise((resolve) => {
      exec(command, { timeout: 3000 }, (err) => {
        if (err) {
          logger.debug('AUTH_BROWSER', `Failed to open host browser (${strategy.platformName}): ${err.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  public openUrl(url: string): void {
    void this.launch(url);
  }
}

export const hostBrowserLauncher = new HostBrowserLauncher();
