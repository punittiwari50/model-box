import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import { logger } from '@/core/logger.js';

export interface CookieSummary {
  exists: boolean;
  cookieCount: number;
  originCount: number;
  domains: string[];
  lastModified: string | null;
  storageStatePath: string;
}

export class CookieStorageService {
  private readonly authDir: string;
  private readonly storageStatePath: string;
  private readonly cookiesJsonPath: string;

  constructor(customWorkflowsDir?: string) {
    const baseDir = customWorkflowsDir || process.env.WORKFLOWS_DIR || path.join(process.cwd(), 'workflows');
    this.authDir = path.join(baseDir, 'auth');
    this.storageStatePath = path.join(this.authDir, 'storage_state.json');
    this.cookiesJsonPath = path.join(this.authDir, 'cookies.json');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }
    } catch (err) {
      logger.warn(`[CookieStorageService] Failed to create auth directory ${this.authDir}: ${err}`);
    }
  }

  public getStorageStatePath(): string {
    return this.storageStatePath;
  }

  public getCookiesJsonPath(): string {
    return this.cookiesJsonPath;
  }

  /**
   * Returns storage state path if valid state file exists and has non-empty cookies/origins
   */
  public loadStorageState(): string | undefined {
    try {
      if (!fs.existsSync(this.storageStatePath)) {
        return undefined;
      }
      const raw = fs.readFileSync(this.storageStatePath, 'utf-8').trim();
      if (!raw || raw === '{}') {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      const hasCookies = Array.isArray(parsed.cookies) && parsed.cookies.length > 0;
      const hasOrigins = Array.isArray(parsed.origins) && parsed.origins.length > 0;
      if (hasCookies || hasOrigins) {
        logger.info(`[CookieStorageService] Loaded storage state from ${this.storageStatePath} (${parsed.cookies?.length || 0} cookies)`);
        return this.storageStatePath;
      }
      return undefined;
    } catch (err) {
      logger.warn(`[CookieStorageService] Error reading storage state from ${this.storageStatePath}: ${err}`);
      return undefined;
    }
  }

  /**
   * Saves storageState from an active Playwright browser context to both storage_state.json and cookies.json
   */
  public async saveStorageState(context: BrowserContext): Promise<{ storageStatePath: string; cookieCount: number }> {
    this.ensureDirectory();
    try {
      await context.storageState({ path: this.storageStatePath });

      // Also dump clean cookies.json for easy inspection and bidirectional manual edits
      let cookieCount = 0;
      try {
        const cookies = await context.cookies();
        cookieCount = cookies.length;
        fs.writeFileSync(this.cookiesJsonPath, JSON.stringify(cookies, null, 2), 'utf-8');
        logger.info(`[CookieStorageService] Persisted ${cookieCount} cookies to ${this.storageStatePath} and ${this.cookiesJsonPath}`);
      } catch (innerErr) {
        logger.warn(`[CookieStorageService] Context cookies write warning: ${innerErr}`);
      }

      return {
        storageStatePath: this.storageStatePath,
        cookieCount,
      };
    } catch (err) {
      logger.error(`[CookieStorageService] Failed to save storage state: ${err}`);
      throw err;
    }
  }

  /**
   * Inspects current saved cookies and storage state
   */
  public getCookieSummary(): CookieSummary {
    try {
      if (!fs.existsSync(this.storageStatePath)) {
        return {
          exists: false,
          cookieCount: 0,
          originCount: 0,
          domains: [],
          lastModified: null,
          storageStatePath: this.storageStatePath,
        };
      }

      const stat = fs.statSync(this.storageStatePath);
      const raw = fs.readFileSync(this.storageStatePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
      const origins = Array.isArray(parsed.origins) ? parsed.origins : [];

      const domains: string[] = Array.from(
        new Set<string>(
          cookies
            .map((c: any) => String(c.domain || ''))
            .filter((d: string) => d.length > 0)
        )
      );

      return {
        exists: true,
        cookieCount: cookies.length,
        originCount: origins.length,
        domains,
        lastModified: stat.mtime.toISOString(),
        storageStatePath: this.storageStatePath,
      };
    } catch (err) {
      return {
        exists: false,
        cookieCount: 0,
        originCount: 0,
        domains: [],
        lastModified: null,
        storageStatePath: this.storageStatePath,
      };
    }
  }

  /**
   * Exports the entire storage state (cookies + origins)
   */
  public exportState(): { cookies: any[]; origins: any[] } | null {
    try {
      if (!fs.existsSync(this.storageStatePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.storageStatePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Imports cookies or full storage state from host or user payload bidirectionally
   */
  public importState(data: any): { success: boolean; cookieCount: number; message: string } {
    this.ensureDirectory();
    try {
      let finalState: { cookies: any[]; origins: any[] } = { cookies: [], origins: [] };

      if (Array.isArray(data)) {
        // Plain array of cookies
        finalState.cookies = data;
      } else if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data.cookies)) {
          finalState.cookies = data.cookies;
          finalState.origins = Array.isArray(data.origins) ? data.origins : [];
        } else {
          throw new Error('Provided object does not contain a cookies array');
        }
      } else if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        return this.importState(parsed);
      } else {
        throw new Error('Unsupported cookie payload format');
      }

      fs.writeFileSync(this.storageStatePath, JSON.stringify(finalState, null, 2), 'utf-8');
      fs.writeFileSync(this.cookiesJsonPath, JSON.stringify(finalState.cookies, null, 2), 'utf-8');

      logger.info(`[CookieStorageService] Imported ${finalState.cookies.length} cookies into ${this.storageStatePath}`);
      return {
        success: true,
        cookieCount: finalState.cookies.length,
        message: `Successfully imported ${finalState.cookies.length} cookies into storage state`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CookieStorageService] Import failed: ${msg}`);
      return {
        success: false,
        cookieCount: 0,
        message: msg,
      };
    }
  }

  /**
   * Clears saved state
   */
  public clearState(): void {
    try {
      if (fs.existsSync(this.storageStatePath)) {
        fs.unlinkSync(this.storageStatePath);
      }
      if (fs.existsSync(this.cookiesJsonPath)) {
        fs.unlinkSync(this.cookiesJsonPath);
      }
      logger.info('[CookieStorageService] Cleared auth storage state');
    } catch (err) {
      logger.warn(`[CookieStorageService] Failed to clear state: ${err}`);
    }
  }
}

export const cookieStorageService = new CookieStorageService();
