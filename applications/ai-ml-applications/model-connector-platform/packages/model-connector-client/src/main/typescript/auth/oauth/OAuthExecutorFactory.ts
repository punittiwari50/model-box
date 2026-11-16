import type { IOAuthExecutor } from "@/auth/oauth/IOAuthExecutor.js";
import { LiveOAuthExecutor } from "@/auth/oauth/LiveOAuthExecutor.js";

export class OAuthExecutorFactory {
  private static instance: IOAuthExecutor | null = null;

  public static getExecutor(): IOAuthExecutor {
    if (!this.instance) {
      this.instance = new LiveOAuthExecutor();
    }
    return this.instance;
  }

  public static setExecutor(executor: IOAuthExecutor | null): void {
    this.instance = executor;
  }
}
