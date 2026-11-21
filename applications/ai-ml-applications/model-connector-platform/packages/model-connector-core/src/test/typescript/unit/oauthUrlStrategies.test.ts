import { describe, it } from "node:test";
import assert from "node:assert";
import {
  oauthProviderUrlStrategyRegistry,
  AntigravityGoogleOAuthUrlStrategy,
  ChatGptOAuthUrlStrategy,
  ClaudeOAuthUrlStrategy,
  CopilotOAuthUrlStrategy,
  GenericModelOAuthUrlStrategy,
} from "@/auth/oauthUrlStrategies.js";

describe("OAuthProviderUrlStrategy Polymorphic Dispatch Tests", () => {
  const googleLoginUrl =
    "https://accounts.google.com/o/oauth2/auth?client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&scope=openid%20profile%20email";
  const openAiUrl = "https://auth0.openai.com/authorize?client_id=chatgpt-cli&response_type=code";
  const anthropicUrl = "https://console.anthropic.com/oauth/authorize?client_id=claude-cli&response_type=code";

  it("should polymorphically resolve AntigravityGoogleOAuthUrlStrategy for Gemini and Antigravity models", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("gemini-3.8-flash");
    assert.ok(strategy instanceof AntigravityGoogleOAuthUrlStrategy);
    assert.strictEqual(strategy.providerId, "google");
    assert.strictEqual(strategy.isValidOAuthUrl(googleLoginUrl), true);
    assert.strictEqual(strategy.isValidOAuthUrl(openAiUrl), false);
  });

  it("should preserve Antigravity PKCE parameters and redirect URI without corruption", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("antigravity");
    const normalized = strategy.normalizeAuthorizationUrl(googleLoginUrl);
    assert.ok(normalized.includes("response_type=code"));
    assert.ok(normalized.includes("antigravity.google%2Foauth-callback"));
  });

  it("should polymorphically resolve ChatGptOAuthUrlStrategy for ChatGPT / OpenAI models", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("gpt-4o");
    assert.ok(strategy instanceof ChatGptOAuthUrlStrategy);
    assert.strictEqual(strategy.providerId, "openai");
  });

  it("should accept Login with Google for ChatGPT without wiping or corrupting the URL", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("chatgpt");
    assert.strictEqual(strategy.isValidOAuthUrl(googleLoginUrl), true);
    assert.strictEqual(strategy.isValidOAuthUrl(openAiUrl), true);
    const normalizedGoogle = strategy.normalizeAuthorizationUrl(googleLoginUrl);
    assert.ok(normalizedGoogle.includes("accounts.google.com"));
    assert.ok(normalizedGoogle.includes("response_type=code"));
  });

  it("should polymorphically resolve ClaudeOAuthUrlStrategy for Claude / Anthropic models", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("claude-3-7-sonnet");
    assert.ok(strategy instanceof ClaudeOAuthUrlStrategy);
    assert.strictEqual(strategy.providerId, "anthropic");
  });

  it("should accept Login with Google for Claude without wiping or corrupting the URL", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("claude-sonnet-4-6");
    assert.strictEqual(strategy.isValidOAuthUrl(googleLoginUrl), true);
    assert.strictEqual(strategy.isValidOAuthUrl(anthropicUrl), true);
    const normalizedGoogle = strategy.normalizeAuthorizationUrl(googleLoginUrl);
    assert.ok(normalizedGoogle.includes("accounts.google.com"));
    assert.ok(normalizedGoogle.includes("response_type=code"));
  });

  it("should resolve effective auth URL using Login with Google when present in session for ChatGPT", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("gpt-4o");
    const effective = strategy.resolveEffectiveAuthUrl(googleLoginUrl, openAiUrl);
    assert.ok(effective.includes("accounts.google.com"), "Effective auth URL must preserve Google SSO for ChatGPT");
  });

  it("should resolve effective auth URL using Login with Google when present in session for Claude", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("claude-3-7-sonnet");
    const effective = strategy.resolveEffectiveAuthUrl(googleLoginUrl, anthropicUrl);
    assert.ok(effective.includes("accounts.google.com"), "Effective auth URL must preserve Google SSO for Claude");
  });

  it("should fallback to GenericModelOAuthUrlStrategy for generic models", () => {
    const strategy = oauthProviderUrlStrategyRegistry.getStrategy("custom-ollama-model");
    assert.ok(strategy instanceof GenericModelOAuthUrlStrategy);
    assert.strictEqual(strategy.isValidOAuthUrl("https://example.com/oauth"), true);
  });
});
