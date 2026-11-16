import { BaseOAuthProvider } from "@/core/adapters/auth/oauth/baseOAuthProvider.js";
import type { OAuthTokenResult } from "@/core/adapters/auth/oauth/iOAuthProvider.js";
import { config } from "@/core/config/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import {
  AuthProviderId,
  ModelFamily,
  OLLAMA_MODELS,
  AuthType,
  isFallbackModel,
} from "@/domain/constants/index.js";
import type { ModelAuth } from "@/domain/index.js";

/**
 * Ollama Local AI Model Provider.
 * Connects to local or remote Ollama instances with zero cloud credential requirement.
 */
export class OllamaOAuthProvider extends BaseOAuthProvider {
  public readonly providerId = AuthProviderId.OLLAMA;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.OLLAMA,
    ...OLLAMA_MODELS,
  ]);

  public supports(modelOrProvider: string): boolean {
    const key = modelOrProvider.toLowerCase();
    return this.supportedKeys.has(key) || isFallbackModel(key);
  }

  protected getAuthType(): (typeof AuthType)[keyof typeof AuthType] {
    return AuthType.OLLAMA;
  }

  protected getAuthUrl(): string {
    return (
      config.getApiBaseUrl(ModelFamily.OLLAMA) ||
      config.auth.providers["ollama"]?.authUrl ||
      "http://127.0.0.1:11435"
    );
  }

  protected async exchangeTokens(code: string): Promise<OAuthTokenResult> {
    return {
      accessToken: code || "ollama-local-token",
      refreshToken: "",
      accountEmail: config.getAccountEmail(ModelFamily.OLLAMA),
      accountName: config.getAccountName(ModelFamily.OLLAMA),
    };
  }

  public async syncCredentials(auth: ModelAuth): Promise<void> {
    logger.info(
      "AUTH_OLLAMA",
      `Ollama local credentials synced for model '${auth.model}'`,
    );
  }

  public async clearCredentials(): Promise<void> {
    logger.info("AUTH_OLLAMA", "Ollama local credentials cleared");
  }
}
