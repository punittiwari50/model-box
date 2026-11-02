import type { IOAuthExecutor } from "@/services/oauth/IOAuthExecutor";
import { LiveOAuthExecutor } from "@/services/oauth/LiveOAuthExecutor";

/**
 * Universal Factory & Registry for OAuth Executors.
 * Strictly separates production execution from automated test simulation.
 * In production/default profiles, LiveOAuthExecutor is always utilized.
 * In unit test fixtures, mock executors can be dynamically registered via setExecutor().
 * Conforms to:
 * - STD-COD-005: Factory & DI Pattern
 * - STD-COD-010: Runtime Isolation
 */
export class OAuthExecutorFactory {
  private static liveInstance: IOAuthExecutor | null = null;
  private static customExecutor: IOAuthExecutor | null = null;

  public static setExecutor(executor: IOAuthExecutor | null): void {
    this.customExecutor = executor;
  }

  public static getExecutor(): IOAuthExecutor {
    if (this.customExecutor) {
      return this.customExecutor;
    }

    if (!this.liveInstance) {
      this.liveInstance = new LiveOAuthExecutor();
    }
    return this.liveInstance;
  }

  public static reset(): void {
    this.customExecutor = null;
    this.liveInstance = null;
  }
}

