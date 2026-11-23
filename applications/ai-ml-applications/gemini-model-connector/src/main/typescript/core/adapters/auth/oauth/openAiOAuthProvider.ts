import path from "node:path";
import { systemFacade } from "@/core/utils/system/systemFacade.js";
import { BaseOAuthProvider } from "@/core/adapters/auth/oauth/baseOAuthProvider.js";
import type { OAuthTokenResult } from "@/core/adapters/auth/oauth/iOAuthProvider.js";
import { config, environment } from "@/core/config/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import {
  AuthProviderId,
  ModelFamily,
  OPENAI_MODELS,
  AuthType,
} from "@/domain/constants/index.js";
import type { ModelAuth } from "@/domain/index.js";

/**
 * OpenAI / Codex Authentication Provider.
 * Decoupled from hardcoded URLs — resolves from application.yml and environment.
 */
export class OpenAiOAuthProvider extends BaseOAuthProvider {
  public readonly providerId = AuthProviderId.OPENAI;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.OPENAI,
    ModelFamily.CODEX,
    ...OPENAI_MODELS,
  ]);

  public supports(modelOrProvider: string): boolean {
    return this.supportedKeys.has(modelOrProvider.toLowerCase());
  }

  protected getAuthType(): (typeof AuthType)[keyof typeof AuthType] {
    return AuthType.OAUTH_OPENAI;
  }

  protected getAuthUrl(): string {
    const providerConfig = config.auth.providers["openai"];
    return providerConfig?.authUrl || config.authEndpoints.openAiAuthUrl;
  }

  protected async exchangeTokens(code: string): Promise<OAuthTokenResult> {
    const token = code || environment.getProperty("OPENAI_API_KEY", "");
    return {
      accessToken: token,
      refreshToken: "",
      accountEmail: config.getAccountEmail(ModelFamily.CODEX),
      accountName: config.getAccountName(ModelFamily.CODEX),
    };
  }

  public async syncCredentials(auth: ModelAuth): Promise<void> {
    logger.info(
      "AUTH_OPENAI",
      `Synchronized OpenAI / Codex credentials for model ${auth.model}`,
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
        const openaiDir = path.join(h, ".openai");
        const codexDir = path.join(h, ".codex");
        if (systemFacade.fs.existsSync(openaiDir)) {
          systemFacade.fs.rmSync(openaiDir, { recursive: true, force: true });
        }
        if (systemFacade.fs.existsSync(codexDir)) {
          systemFacade.fs.rmSync(codexDir, { recursive: true, force: true });
        }
      } catch (err: any) {
        logger.debug(
          "AUTH_OPENAI",
          `Could not purge openai config in ${h}: ${err.message}`,
        );
      }
    }

    delete process.env.OPENAI_API_KEY;
    logger.info("AUTH_OPENAI", "Full OpenAI / Codex CLI logout executed");
  }
}
