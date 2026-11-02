import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ModelOAuthStrategyRegistry,
  GeminiOAuthProviderStrategy,
  ClaudeOAuthProviderStrategy,
  CopilotOAuthProviderStrategy,
  OpenAiOAuthProviderStrategy,
  GrokOAuthProviderStrategy,
  OllamaOAuthProviderStrategy,
} from "@/strategies/oauth/ModelOAuthStrategyRegistry.js";

describe("ModelOAuthStrategyRegistry & OAuth Provider Strategies Tests", () => {
  it("resolves Gemini strategy for Google models and configures account chooser URL with select_account consent", () => {
    const registry = new ModelOAuthStrategyRegistry();
    const strategy = registry.resolveByModel("gemini-3.8-flash");

    assert.ok(strategy instanceof GeminiOAuthProviderStrategy);
    assert.strictEqual(strategy.providerId, "google");

    const config = strategy.buildOAuthAuthorizationConfig({
      modelId: "gemini-3.8-flash",
      userEmail: "developer@gmail.com",
    });

    assert.strictEqual(config.prompt, "select_account consent");
    assert.ok(config.authorizationUrl.includes("prompt=select_account+consent") || config.authorizationUrl.includes("prompt=select_account%20consent"));
    assert.ok(config.executableLaunchUrl.includes("oauth2/authorize"));
    assert.ok(config.executableLaunchUrl.includes("model=gemini-3.8-flash"));
    assert.strictEqual(config.usesLoopbackAccountChooser, true, "Placeholder/empty client routes to interactive Account Chooser");
  });

  it("builds upstream authorization URL with granted scopes when custom production clientId is supplied", () => {
    const strategy = new GeminiOAuthProviderStrategy();
    const googleCustomClientId = `oauth-ref-${Date.now()}-google-custom`;
    const config = strategy.buildOAuthAuthorizationConfig({
      modelId: "gemini-3.8-flash",
      clientId: googleCustomClientId,
      preferInteractiveChooser: false,
    });

    assert.strictEqual(config.usesLoopbackAccountChooser, false);
    assert.ok(config.authorizationUrl.includes(googleCustomClientId));
    assert.ok(config.authorizationUrl.includes("include_granted_scopes=true"));
    assert.ok(config.authorizationUrl.includes("prompt=select_account+consent") || config.authorizationUrl.includes("prompt=select_account%20consent"));
  });

  it("identifies PKCE / CLI tokens across model providers", () => {
    const strategy = new GeminiOAuthProviderStrategy();
    assert.strictEqual(strategy.isLoopbackOrPkceToken("ya29.pkce_google_token_123"), true);
    assert.strictEqual(strategy.isLoopbackOrPkceToken("oauth_pkce_google_token_456"), true);
    assert.strictEqual(strategy.isLoopbackOrPkceToken("sk-ant-oat01-claude-token"), true);
    assert.strictEqual(strategy.isLoopbackOrPkceToken("gho_copilot_token"), true);
    assert.strictEqual(strategy.isLoopbackOrPkceToken("ya29.live-production-jwt"), false);
  });

  it("builds CLI execution environment with user-specific identity for each provider", () => {
    const gemini = new GeminiOAuthProviderStrategy();
    const geminiEnv = gemini.buildCliAuthEnvironment("ya29.test_token", "user@company.com");
    assert.strictEqual(geminiEnv.GOOGLE_GENAI_USE_GCA, "true");
    assert.strictEqual(geminiEnv.GOOGLE_CLOUD_ACCESS_TOKEN, "ya29.test_token");
    assert.strictEqual(geminiEnv.GOOGLE_ACCOUNT_EMAIL, "user@company.com");

    const claude = new ClaudeOAuthProviderStrategy();
    const claudeEnv = claude.buildCliAuthEnvironment("sk-ant-oat01-token", "user@company.com");
    assert.strictEqual(claudeEnv.CLAUDE_CODE_OAUTH_TOKEN, "sk-ant-oat01-token");
    assert.strictEqual(claudeEnv.CLAUDE_USER_EMAIL, "user@company.com");

    const copilot = new CopilotOAuthProviderStrategy();
    const copilotEnv = copilot.buildCliAuthEnvironment("gho_token", "user@company.com");
    assert.strictEqual(copilotEnv.GITHUB_TOKEN, "gho_token");
    assert.strictEqual(copilotEnv.GITHUB_USER_EMAIL, "user@company.com");

    const ollama = new OllamaOAuthProviderStrategy();
    const ollamaEnv = ollama.buildCliAuthEnvironment("ollama-token", "user@company.com");
    assert.strictEqual(ollamaEnv.OLLAMA_OAUTH_TOKEN, "ollama-token");
    assert.strictEqual(ollamaEnv.OLLAMA_USER_EMAIL, "user@company.com");
  });

  it("resolves provider strategies by provider key or model alias", () => {
    const registry = new ModelOAuthStrategyRegistry();
    assert.ok(registry.resolveByModel("claude-3-7-sonnet") instanceof ClaudeOAuthProviderStrategy);
    assert.ok(registry.resolveByModel("copilot-gpt-4o") instanceof CopilotOAuthProviderStrategy);
    assert.ok(registry.resolveByModel("gpt-4o") instanceof OpenAiOAuthProviderStrategy);
    assert.ok(registry.resolveByModel("grok-3") instanceof GrokOAuthProviderStrategy);
    assert.ok(registry.resolveByModel("llama3.2") instanceof OllamaOAuthProviderStrategy);
    assert.ok(registry.resolveByProvider("anthropic") instanceof ClaudeOAuthProviderStrategy);
    assert.ok(registry.resolveByProvider("ollama") instanceof OllamaOAuthProviderStrategy);
  });
});
