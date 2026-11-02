import type { IOAuthExecutor } from "@/services/oauth/IOAuthExecutor";
import type { IOAuthTokenExchangeResult, ITokenValidationResult, OAuthExchangeRequest } from "@/services/oauth/types";

/**
 * Unit Test Mock OAuth Executor Strategy.
 * Isolated in src/test/typescript/mocks.
 * Provides deterministic simulation fixtures for offline unit testing without leaking mocks to production runtime.
 */
export class MockOAuthExecutor implements IOAuthExecutor {
  public async exchangeCode(request: OAuthExchangeRequest): Promise<IOAuthTokenExchangeResult> {
    const { modelId, provider, userEmail } = request;
    const email = userEmail || `${modelId}-test@enterprise.internal`;

    return {
      accessToken: `mock_test_token_${provider}_${Date.now()}`,
      refreshToken: `mock_refresh_token_${provider}`,
      tokenType: "Bearer",
      expiresInSeconds: 3600,
      scopes: ["openid", "profile", "email"],
      userEmail: email,
      userName: "Test User",
      provider,
      authorizedTimestamp: new Date().toISOString(),
    };
  }

  public async validateToken(
    token: string,
    modelId: string,
    prompt?: string,
  ): Promise<ITokenValidationResult> {
    const hasCred = Boolean(token && token.trim().length > 3);
    const userPrompt = prompt || "Hi , whats date time now ?";

    return {
      status: hasCred ? "VERIFIED" : "FAILED",
      protocol: "OAuth 2.0 PKCE",
      message: hasCred ? `Unit test connection verified for ${modelId}` : "Unit test validation failed: missing token",
      latencyMs: 1,
      email: hasCred ? "test-user@enterprise.internal" : undefined,
      modelOutput: hasCred ? `[Unit Test Mock Output for ${modelId}]: Prompt verified: ${userPrompt}` : undefined,
      errorMessage: !hasCred ? "Unit test mock: missing credential" : undefined,
      details: { unitTest: true, modelId },
    };
  }
}
