import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DatabaseUserModelCredentialResolver,
  type ResolvedUserModelCredential,
} from "@/security/UserModelCredentialResolver.js";

describe("DatabaseUserModelCredentialResolver Tests", () => {
  it("resolves registered in-memory user credential override by model and email", () => {
    const resolver = new DatabaseUserModelCredentialResolver();
    const userCred: ResolvedUserModelCredential = {
      accountId: "acc-user-1",
      modelId: "gemini-3.8-flash",
      accountName: "Personal Gemini Account",
      userEmail: "<user-email>",
      authType: "cli_oauth",
      oauthToken: "ya29.pkce_test_token_123",
      isActive: true,
    };

    resolver.registerCredentialOverride("gemini-3.8-flash:<user-email>", userCred);

    const resolved = resolver.resolveUserCredential({
      modelId: "gemini-3.8-flash",
      userEmail: "<user-email>",
    });

    assert.ok(resolved !== null, "Resolved credential must not be null");
    assert.strictEqual(resolved.accountId, "acc-user-1");
    assert.strictEqual(resolved.userEmail, "<user-email>");
    assert.strictEqual(resolved.oauthToken, "ya29.pkce_test_token_123");
    assert.strictEqual(resolved.authType, "cli_oauth");
  });

  it("prioritizes specific userEmail over generic model credential", () => {
    const resolver = new DatabaseUserModelCredentialResolver();
    const genericCred: ResolvedUserModelCredential = {
      accountId: "acc-generic",
      modelId: "gemini-3.8-flash",
      accountName: "Generic Account",
      userEmail: "<user-email-default>",
      authType: "api_key",
      apiKey: "generic-key",
      isActive: true,
    };
    const specificCred: ResolvedUserModelCredential = {
      accountId: "acc-specific",
      modelId: "gemini-3.8-flash",
      accountName: "Specific Engineer",
      userEmail: "<user-email-specific>",
      authType: "cli_oauth",
      oauthToken: "ya29.pkce_specific_token",
      isActive: true,
    };

    resolver.registerCredentialOverride("gemini-3.8-flash", genericCred);
    resolver.registerCredentialOverride("gemini-3.8-flash:<user-email-specific>", specificCred);

    const result = resolver.resolveUserCredential({
      modelId: "gemini-3.8-flash",
      userEmail: "<user-email-specific>",
    });

    assert.ok(result !== null);
    assert.strictEqual(result.userEmail, "<user-email-specific>");
    assert.strictEqual(result.oauthToken, "ya29.pkce_specific_token");
  });

  it("returns null safely when no credential matches criteria without throwing", () => {
    const resolver = new DatabaseUserModelCredentialResolver();
    const result = resolver.resolveUserCredential({
      modelId: "unknown-model-xyz",
      userEmail: "<user-email-nobody>",
    });
    assert.strictEqual(result, null);
  });
});

