import { describe, it } from "node:test";
import assert from "node:assert";
import {
  oauthProviderRegistry,
  GoogleOAuthProvider,
  AnthropicOAuthProvider,
  OpenAiOAuthProvider,
  CopilotOAuthProvider,
} from "@/core/adapters/auth/oauth/index.js";
import {
  AuthProviderId,
  ModelCatalog,
  ModelFamily,
  AuthType,
} from "@/domain/constants/index.js";
import { CopilotCliStrategy } from "@/core/cli/cliCommandStrategy.js";
import {
  authTypeResolver,
  AuthTypeResolver,
} from "@/core/adapters/auth/index.js";

describe("Decoupled OAuth & Authentication Provider Architecture", () => {
  it("should resolve GoogleOAuthProvider for Gemini models", () => {
    const provider = oauthProviderRegistry.getProvider("gemini-3.8-flash");
    assert.strictEqual(provider.providerId, AuthProviderId.GOOGLE);
    assert.ok(provider instanceof GoogleOAuthProvider);
  });

  it("should resolve AnthropicOAuthProvider for Claude models", () => {
    const provider = oauthProviderRegistry.getProvider(
      ModelCatalog.CLAUDE_3_5_SONNET,
    );
    assert.strictEqual(provider.providerId, AuthProviderId.ANTHROPIC);
    assert.ok(provider instanceof AnthropicOAuthProvider);
  });

  it("should resolve OpenAiOAuthProvider for GPT models", () => {
    const provider = oauthProviderRegistry.getProvider(ModelCatalog.GPT_4O);
    assert.strictEqual(provider.providerId, AuthProviderId.OPENAI);
    assert.ok(provider instanceof OpenAiOAuthProvider);
  });

  it("should resolve CopilotOAuthProvider for Copilot models", () => {
    const provider = oauthProviderRegistry.getProvider("copilot");
    assert.strictEqual(provider.providerId, AuthProviderId.COPILOT);
    assert.ok(provider instanceof CopilotOAuthProvider);

    const chatProvider = oauthProviderRegistry.getProvider("copilot-chat");
    assert.strictEqual(chatProvider.providerId, AuthProviderId.COPILOT);
  });

  it("should generate GitHub OAuth URL when initiating Copilot auth", async () => {
    const provider = new CopilotOAuthProvider();
    const result = await provider.initiateAuth({
      model: "copilot",
      launchBrowser: false,
      redirectUriOverride: "http://127.0.0.1:8090/api/v1/auth/callback",
    });

    assert.ok(result.auth_url.includes("github.com/login/oauth/authorize"));
    assert.ok(result.auth_url.includes("client_id="));
    assert.ok(result.auth_url.includes("scope="));
    assert.ok(result.auth_url.includes("state="));
    assert.strictEqual(result.browser_launched, false);
    assert.strictEqual(result.provider, AuthProviderId.COPILOT);
  });

  it("should handle direct GitHub token in exchangeTokens for Copilot", async () => {
    const provider = new CopilotOAuthProvider();
    const tokenResult = await (provider as any).exchangeTokens(
      "ghp_mockSecretTokenForTesting123",
      "http://127.0.0.1:8090/api/v1/auth/callback",
    );
    assert.strictEqual(
      tokenResult.accessToken,
      "ghp_mockSecretTokenForTesting123",
    );
    assert.ok(tokenResult.accountEmail);
    assert.ok(tokenResult.accountName);
  });

  it("should resolve CopilotCliStrategy and construct CLI arguments correctly", () => {
    const strategy = new CopilotCliStrategy();
    assert.strictEqual(strategy.family, ModelFamily.COPILOT);
    assert.strictEqual(strategy.supports("copilot"), true);
    assert.strictEqual(strategy.supports("copilot-chat"), true);

    const args = strategy.buildCommandArgs(
      "copilot",
      "copilot-chat",
      "Write a function",
      {
        prompt: "Write a function",
        systemInstruction: "You are an expert programmer",
      },
    );
    assert.deepStrictEqual(args, [
      "--model",
      "copilot-chat",
      "-p",
      "[System: You are an expert programmer]\n\nWrite a function",
    ]);

    const env = strategy.prepareEnvironment(
      { PATH: "/usr/bin" },
      "ghp_mockToken",
    );
    assert.strictEqual(env.GITHUB_TOKEN, "ghp_mockToken");
    assert.strictEqual(env.GH_TOKEN, "ghp_mockToken");
    assert.strictEqual(env.COPILOT_API_KEY, "ghp_mockToken");
  });

  it("should generate PKCE challenge and state when initiating auth without browser launch", async () => {
    const provider = new GoogleOAuthProvider();
    const result = await provider.initiateAuth({
      model: "gemini-3.8-flash",
      launchBrowser: false,
      redirectUriOverride: "http://127.0.0.1:8090/api/v1/auth/callback",
    });

    assert.ok(result.auth_url.includes("client_id="));
    assert.ok(result.auth_url.includes("code_challenge="));
    assert.ok(result.auth_url.includes("state="));
    assert.strictEqual(result.browser_launched, false);
    assert.strictEqual(result.provider, AuthProviderId.GOOGLE);
    assert.ok(result.code_verifier);
  });

  describe("AuthTypeResolver OOP Strategy Pipeline", () => {
    it("should prioritize explicit auth_type when provided", () => {
      const authType = authTypeResolver.resolveAuthType({
        model: "gemini-3.8-flash",
        token: "ya29.mockToken",
        explicitAuthType: "custom-auth-type",
      });
      assert.strictEqual(authType, "custom-auth-type");
    });

    it("should resolve AuthType.OAUTH_GOOGLE for Google OAuth tokens", () => {
      const authType = authTypeResolver.resolveAuthType({
        model: "gemini-3.8-flash",
        token: "ya29.a0ARrdaM-exampleToken",
      });
      assert.strictEqual(authType, AuthType.OAUTH_GOOGLE);
    });

    it("should resolve AuthType.OAUTH_COPILOT for Copilot models", () => {
      const authType = authTypeResolver.resolveAuthType({
        model: "copilot",
        token: "some-token",
      });
      assert.strictEqual(authType, AuthType.OAUTH_COPILOT);

      const chatAuthType = authTypeResolver.resolveAuthType({
        model: "copilot-chat",
        token: "some-token",
      });
      assert.strictEqual(chatAuthType, AuthType.OAUTH_COPILOT);
    });

    it("should resolve AuthType.OAUTH_COPILOT for GitHub prefixed tokens", () => {
      const authType = authTypeResolver.resolveAuthType({
        model: "generic-model",
        token: "ghp_secretToken12345",
      });
      assert.strictEqual(authType, AuthType.OAUTH_COPILOT);

      const patAuthType = authTypeResolver.resolveAuthType({
        model: "generic-model",
        token: "github_pat_11AAAAAAA",
      });
      assert.strictEqual(patAuthType, AuthType.OAUTH_COPILOT);
    });

    it("should fallback to AuthType.API_KEY for standard API keys", () => {
      const authType = authTypeResolver.resolveAuthType({
        model: "gemini-3.8-flash",
        token: "AIzaSyDemoKey123",
      });
      assert.strictEqual(authType, AuthType.API_KEY);
    });

    it("should allow custom AuthTypeResolver instantiation and strategy prioritization", () => {
      const customResolver = new AuthTypeResolver([
        {
          priority: 5,
          supports: () => true,
          resolve: () => AuthType.VERTEX_AI,
        },
      ]);
      const resolved = customResolver.resolveAuthType({
        model: "any",
        token: "any",
      });
      assert.strictEqual(resolved, AuthType.VERTEX_AI);
    });
  });
});
