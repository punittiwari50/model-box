import { modelAuthContainer } from "@model-box/model-connector-core";
import type { IOAuthExecutor } from "@/auth/oauth/IOAuthExecutor.js";
import type {
  IOAuthTokenExchangeResult,
  ITokenValidationResult,
  OAuthExchangeRequest,
} from "@/auth/oauth/types.js";

/**
 * Enterprise Production OAuth Executor Strategy in model-connector-client.
 * Dispatches polymorphically via modelAuthContainer to provider-specific strategies
 * configured declaratively in application.yml.
 */
export class LiveOAuthExecutor implements IOAuthExecutor {
  public async exchangeCode(request: OAuthExchangeRequest): Promise<IOAuthTokenExchangeResult> {
    const { code, provider, modelId } = request;

    if (!code || !code.trim()) {
      throw new Error(`Missing authorization code for provider '${provider || "unknown"}'.`);
    }

    const providerConfig = provider
      ? modelAuthContainer.getProviderConfig(provider)
      : modelAuthContainer.resolveProviderForModel(modelId || "gemini");

    const onboardingStrategy = modelAuthContainer.getOnboardingStrategy(providerConfig.providerId, "oauth");

    const exchangeResult = await onboardingStrategy.exchangeCredentials(providerConfig, {
      code,
      modelId: modelId || "default",
      userEmail: request.userEmail,
      redirectUri: request.redirectUri || providerConfig.defaultRedirectUri,
      clientId: request.clientId || providerConfig.clientId,
      clientSecret: request.clientSecret || providerConfig.clientSecret,
      codeVerifier: request.pkceCodeVerifier,
    });

    return {
      accessToken: exchangeResult.accessToken,
      refreshToken: exchangeResult.refreshToken,
      tokenType: exchangeResult.tokenType,
      expiresInSeconds: exchangeResult.expiresInSeconds,
      scopes: exchangeResult.scopes,
      userEmail: exchangeResult.userEmail,
      userName: exchangeResult.userName || exchangeResult.userEmail.split("@")[0],
      provider: providerConfig.providerId,
      authorizedTimestamp: exchangeResult.authorizedTimestamp,
    };
  }

  public async validateToken(
    token: string,
    modelId: string,
    prompt?: string,
  ): Promise<ITokenValidationResult> {
    const providerConfig = modelAuthContainer.resolveProviderForModel(modelId);
    const onboardingStrategy = modelAuthContainer.getOnboardingStrategy(providerConfig.providerId, "oauth");
    const result = await onboardingStrategy.validateCredentials(providerConfig, token, modelId, prompt);

    return {
      status: result.status,
      protocol: result.protocol,
      message: result.message,
      latencyMs: result.latencyMs,
      email: result.email,
      scopes: result.scopes,
      expiresInSeconds: result.expiresInSeconds,
      modelOutput: result.modelOutput,
      errorMessage: result.errorMessage,
      details: result.details,
    };
  }
}
