import path from "node:path";
import { systemFacade } from "@/core/utils/system/systemFacade.js";
import { BaseOAuthProvider } from "@/core/adapters/auth/oauth/baseOAuthProvider.js";
import type { OAuthTokenResult } from "@/core/adapters/auth/oauth/iOAuthProvider.js";
import { config, environment } from "@/core/config/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import {
  AuthProviderId,
  ModelFamily,
  CLAUDE_MODELS,
  AuthType,
} from "@/domain/constants/index.js";
import type { ModelAuth } from "@/domain/index.js";

/**
 * Anthropic Claude Authentication Provider.
 * Decoupled from hardcoded URLs — resolves from application.yml and environment.
 */
export class AnthropicOAuthProvider extends BaseOAuthProvider {
  public readonly providerId = AuthProviderId.ANTHROPIC;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.ANTHROPIC,
    ModelFamily.CLAUDE,
    ...CLAUDE_MODELS,
  ]);

  public supports(modelOrProvider: string): boolean {
    return this.supportedKeys.has(modelOrProvider.toLowerCase());
  }

  protected getAuthType(): (typeof AuthType)[keyof typeof AuthType] {
    return AuthType.OAUTH_ANTHROPIC;
  }

  protected getAuthUrl(): string {
    const providerConfig = config.auth.providers["anthropic"];
    return providerConfig?.authUrl || config.authEndpoints.anthropicAuthUrl;
  }

  protected async exchangeTokens(code: string): Promise<OAuthTokenResult> {
    const token = code || environment.getProperty("ANTHROPIC_API_KEY", "");
    return {
      accessToken: token,
      refreshToken: "",
      accountEmail: config.getAccountEmail(ModelFamily.CLAUDE),
      accountName: config.getAccountName(ModelFamily.CLAUDE),
    };
  }

  public async syncCredentials(auth: ModelAuth): Promise<void> {
    logger.info(
      "AUTH_CLAUDE",
      `Synchronized Anthropic Claude credentials for model ${auth.model}`,
    );
  }

  public async clearCredentials(): Promise<void> {
    const homedirs = [
      systemFacade.os.homedir(),
      "/root",
      "/home/node",
      environment.getProperty("HOME", ""),
      environment.getProperty("USERPROFILE", ""),
    ].filter(Boolean);

    for (const h of new Set(homedirs)) {
      try {
        const claudeDir = path.join(h, ".claude");
        const claudeJson = path.join(h, ".claude.json");
        const claudeConfig = path.join(h, ".config", "claude");
        if (systemFacade.fs.existsSync(claudeDir)) {
          systemFacade.fs.rmSync(claudeDir, { recursive: true, force: true });
        }
        if (systemFacade.fs.existsSync(claudeJson)) {
          systemFacade.fs.rmSync(claudeJson, { force: true });
        }
        if (systemFacade.fs.existsSync(claudeConfig)) {
          systemFacade.fs.rmSync(claudeConfig, { recursive: true, force: true });
        }
      } catch (err: any) {
        logger.debug(
          "AUTH_CLAUDE",
          `Could not purge claude config in ${h}: ${err.message}`,
        );
      }
    }

    delete process.env.ANTHROPIC_API_KEY;
    logger.info("AUTH_CLAUDE", "Full Anthropic Claude CLI logout executed");
  }
}
